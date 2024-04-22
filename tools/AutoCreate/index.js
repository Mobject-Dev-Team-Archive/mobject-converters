const { v4: uuidv4 } = require("uuid");
const fs = require("fs").promises;
const path = require("path");
const outputFolder = path.join(__dirname, "output/");

let fileCounter = 0;
let testCounter = 0;

async function main() {
  const convertCsvFilePath = path.join(__dirname, "data", "convert.csv");

  await fs.mkdir(outputFolder, { recursive: true });

  try {
    const csvFileLines = await fs.readFile(convertCsvFilePath, "utf8");
    const convertTable = parseCsv(csvFileLines);

    await createGVLMinsAndMax(convertTable);
    await createTypeToTypeFunctions(convertTable);
    await createTypeToDestination(convertTable);
    await createSourceToDestination(convertTable);
    await createTests(convertTable);
  } catch (err) {
    console.error("Error reading the file:", err);
  }

  console.log("created", fileCounter, "files");
  console.log("created", testCounter, "tests");
  console.log(
    "Modify test Check_STRING_TO_LREAL_Valid, value : STRING := LREAL_TO_STRING(DatatypeLimits.MAX_VALUE_OF_LREAL_WHICH_CAN_BE_HELD_IN_A_STRING);"
  );
  console.log(
    "Remove DATE_TO_DT_TooHigh <= this is no longer required as a test"
  );
  console.log(
    "Remove STRING_TO_BOOL_Invalid <= this is no longer required as a test"
  );
}

function parseCsv(csvFileLines) {
  const lines = csvFileLines.split("\n");
  const header = lines.shift().split(",");
  const convertTable = {};

  lines.forEach((line) => {
    const rowData = line.split(",");
    const fromKey = rowData.shift().replace(/\r/g, "");
    convertTable[fromKey] = {};

    rowData.forEach((convertType, index) => {
      const toKey = header[index + 1].replace(/\r/g, "");
      convertTable[fromKey][toKey] = convertType.replace(/\r/g, "");
    });
  });

  return convertTable;
}

main();

async function createTypeToTypeFunctions(convertTable) {
  for (const fromKey in convertTable) {
    const from = fromKey;
    const typeDirectory = from + "_TO_";
    const fullTypeDirectory = path.join(outputFolder, "lib", typeDirectory);

    await fs.mkdir(fullTypeDirectory, { recursive: true });

    for (const toKey in convertTable[fromKey]) {
      const to = toKey;
      const convertType = convertTable[fromKey][toKey];
      const pouFunction = new PouBuilder(`TryConvert_${from}_TO_${to}`);

      if (from == "LREAL" && to == "STRING") {
        console.log("here");
      }

      pouFunction.declaration
        .addLine(`FUNCTION ${pouFunction.name} : BOOL`)
        .addLine("VAR_INPUT")
        .indent()
        .addLine(`in : ${from};`)
        .addLine(`out : REFERENCE TO ${to};`)
        .outdent()
        .addLine("END_VAR");

      if (convertType == "MAX" || convertType == "MIN/MAX") {
        pouFunction.body
          .addLine(
            `IF in > DatatypeLimits.MAX_VALUE_OF_${from}_WHICH_CAN_BE_HELD_IN_A_${to} THEN`
          )
          .indent()
          .addLine(`RETURN;`)
          .outdent()
          .addLine(`END_IF`)
          .addLine(``);
      }

      if (convertType == "MIN" || convertType == "MIN/MAX") {
        pouFunction.body
          .addLine(
            `IF in < DatatypeLimits.MIN_VALUE_OF_${from}_WHICH_CAN_BE_HELD_IN_A_${to} THEN`
          )
          .indent()
          .addLine(`RETURN;`)
          .outdent()
          .addLine(`END_IF`)
          .addLine(``);
      }

      if (convertType == "DOUBLECHECK") {
        pouFunction.body
          .addLine(`IF in <> ${to}_TO_${from}(${from}_TO_${to}(in)) THEN`)
          .indent()
          .addLine(`RETURN;`)
          .outdent()
          .addLine(`END_IF`)
          .addLine(``);
      }

      if (convertType == "EQUAL") {
        pouFunction.body
          .addLine(`out := in;`)
          .addLine(`${pouFunction.name} := TRUE;`);
      } else {
        pouFunction.body
          .addLine(`out := ${from}_TO_${to}(in);`)
          .addLine(`${pouFunction.name} := TRUE;`);
      }

      await fs.writeFile(
        path.join(fullTypeDirectory, pouFunction.name + ".TcPOU"),
        pouFunction.toXmlString(),
        "utf8"
      );
      fileCounter += 1;
    }
  }
}

async function createTypeToDestination(convertTable) {
  for (const fromKey in convertTable) {
    const from = fromKey;
    const typeDirectory = from + "_TO_";
    const fullTypeDirectory = path.join(outputFolder, "lib", typeDirectory);

    await fs.mkdir(fullTypeDirectory, { recursive: true });

    const pouFunction = new PouBuilder(`TryConvert_${from}_TO_Destination`);

    pouFunction.declaration
      .addLine(`FUNCTION ${pouFunction.name} : BOOL`)
      .addLine("VAR_INPUT")
      .indent()
      .addLine(`in : ${from};`)
      .addLine(`out : ANY;`)
      .outdent()
      .addLine("END_VAR")
      .addLine("VAR")
      .indent()
      .addLine("convertResult : BOOL := FALSE;")
      .addLine("convertAddress : PVOID;");

    for (const toKey in convertTable[fromKey]) {
      const to = toKey;
      pouFunction.declaration.addLine(`_${to} : ${to};`);
    }

    pouFunction.declaration.outdent().addLine("END_VAR");

    pouFunction.body.addLine("CASE out.TypeClass OF");

    for (const toKey in convertTable[fromKey]) {
      const to = toKey;
      let type = to;

      if (type == "TOD") {
        type = "TIMEOFDAY";
      }

      if (type == "DT") {
        type = "DATEANDTIME";
      }

      pouFunction.body
        .indent()
        .addLine(`__SYSTEM.TYPE_CLASS.TYPE_${type}:`)
        .addLine("")
        .addLine(`convertResult := TryConvert_${from}_TO_${to}(in, _${to});`)
        .addLine("IF convertResult THEN")
        .indent()
        .addLine(`convertAddress := ADR(_${to});`)
        .outdent()
        .addLine("END_IF")
        .addLine("")
        .outdent();
    }

    pouFunction.body
      .outdent()
      .addLine("END_CASE")
      .addLine("")
      .addLine("IF convertResult THEN")
      .indent()
      .addLine("memcpy(out.pValue,convertAddress,DINT_TO_UDINT(out.diSize));")
      .outdent()
      .addLine("END_IF")
      .addLine("")
      .addLine(`${pouFunction.name} := convertResult;`);

    await fs.writeFile(
      path.join(fullTypeDirectory, pouFunction.name + ".TcPOU"),
      pouFunction.toXmlString(),
      "utf8"
    );
    fileCounter += 1;
  }
}

async function createSourceToDestination(convertTable) {
  const pouFunction = new PouBuilder(`TryConvert_Source_TO_Destination`);

  pouFunction.declaration
    .addLine(`FUNCTION ${pouFunction.name} : BOOL`)
    .addLine("VAR_INPUT")
    .indent()
    .addLine("in : ANY;")
    .addLine("out : ANY;")
    .outdent()
    .addLine("END_VAR")
    .addLine("VAR")
    .indent();

  for (const toKey in convertTable) {
    const to = toKey;
    pouFunction.declaration.addLine(`_${to} : ${to};`);
  }

  pouFunction.declaration
    .addLine("convertResult : BOOL := FALSE;")
    .outdent()
    .addLine("END_VAR");

  pouFunction.body.addLine("CASE in.TypeClass OF").addLine("").indent();

  for (const toKey in convertTable) {
    const to = toKey;
    let type = toKey;

    if (type == "TOD") {
      type = "TIMEOFDAY";
    }

    if (type == "DT") {
      type = "DATEANDTIME";
    }

    pouFunction.body
      .addLine(`__SYSTEM.TYPE_CLASS.TYPE_${type} :`)
      .indent()
      .addLine(`memcpy(ADR(_${to}),in.pValue,in.diSize);`)
      .addLine(`convertResult := TryConvert_${to}_To_Destination(_${to}, out);`)
      .addLine(``)
      .outdent();
  }

  pouFunction.body
    .addLine("END_CASE")
    .outdent()
    .addLine(`${pouFunction.name}  := convertResult;`);

  await fs.writeFile(
    path.join(outputFolder, "lib", pouFunction.name + ".TcPOU"),
    pouFunction.toXmlString(),
    "utf8"
  );
  fileCounter += 1;
}

async function createGVLMinsAndMax(dict) {
  let gvl = "";
  // Iterate over every member of dict and print to screen
  for (const rowKey in dict) {
    gvl += `\n// Limits of ${rowKey} used for conversions\n`;

    function createUpperLimit(from, to) {
      gvl += `MAX_VALUE_OF_${from}_WHICH_CAN_BE_HELD_IN_A_${to} : ${from} := ${to}_TO_${from}(${to}_MAX_VALUE);\n`;
    }

    function createLowerLimit(from, to) {
      gvl += `MIN_VALUE_OF_${from}_WHICH_CAN_BE_HELD_IN_A_${to} : ${from} := ${to}_TO_${from}(${to}_MIN_VALUE);\n`;
    }

    for (const colKey in dict[rowKey]) {
      if (dict[rowKey][colKey] == "MIN") {
        createLowerLimit(rowKey, colKey);
      }

      if (dict[rowKey][colKey] == "MAX") {
        createUpperLimit(rowKey, colKey);
      }

      if (dict[rowKey][colKey] == "MIN/MAX") {
        createLowerLimit(rowKey, colKey);
        createUpperLimit(rowKey, colKey);
      }
    }
  }

  await fs.writeFile(path.join(outputFolder, "GVL Additions.txt"), gvl, "utf8");
  fileCounter += 1;
}

async function createTests(convertTable) {
  const testDirectory = path.join(outputFolder, "tests");
  await fs.mkdir(testDirectory, { recursive: true });

  let testVariables = "";

  for (const fromKey in convertTable) {
    const from = fromKey;

    const pou = new PouBuilder(`${from}_TO_TestSuite`);

    testVariables += `\t${pou.name} : ${pou.name};\n`;

    pou.declaration
      .addLine(`FUNCTION_BLOCK PUBLIC ${pou.name} EXTENDS TcUnit.FB_TestSuite`)
      .addLine(`VAR`)
      .addLine(`END_VAR`);

    for (const toKey in convertTable[fromKey]) {
      const to = toKey;
      const convertType = convertTable[fromKey][toKey];

      if (from == "STRING") {
        // strings are to be treated different as they need to do a double check

        const validCheckMethod = pou.addMethod(`Check_${from}_TO_${to}_Valid`);
        pou.body.addLine(`${validCheckMethod.name}();`);

        if (to == "STRING") {
          createValidConvertMethodContent(
            from,
            to,
            `'hello'`,
            validCheckMethod
          );
        } else {
          createValidConvertMethodContent(
            from,
            to,
            `${to}_TO_STRING(DatatypeLimits.${to}_MAX_VALUE)`,
            validCheckMethod
          );

          const invalidCheckMethod = pou.addMethod(
            `Check_${from}_TO_${to}_Invalid`
          );
          pou.body.addLine(`${invalidCheckMethod.name}();`);

          createOutOfRangeConvertMethodContent(
            from,
            to,
            `'hello'`,
            invalidCheckMethod
          );
        }
      } else {
        // all tests here are for non-string types.  These will use the upper and lower ranges

        const upperCheckMethod = pou.addMethod(`Check_${from}_TO_${to}_Max`);
        pou.body.addLine(`${upperCheckMethod.name}();`);

        const lowerCheckMethod = pou.addMethod(`Check_${from}_TO_${to}_Min`);
        pou.body.addLine(`${lowerCheckMethod.name}();`);

        if (convertType == "MAX" || convertType == "MIN/MAX") {
          const tooHighCheckMethod = pou.addMethod(
            `Check_${from}_TO_${to}_TooHigh`
          );
          pou.body.addLine(`${tooHighCheckMethod.name}();`);

          createOutOfRangeConvertMethodContent(
            from,
            to,
            `DatatypeLimits.${from}_MAX_VALUE`,
            tooHighCheckMethod
          );

          createValidConvertMethodContent(
            from,
            to,
            `DatatypeLimits.MAX_VALUE_OF_${from}_WHICH_CAN_BE_HELD_IN_A_${to}`,
            upperCheckMethod
          );
        } else {
          // only generate the standard upper check
          createValidConvertMethodContent(
            from,
            to,
            `DatatypeLimits.${from}_MAX_VALUE`,
            upperCheckMethod
          );
        }

        if (convertType == "MIN" || convertType == "MIN/MAX") {
          const tooLowCheckMethod = pou.addMethod(
            `Check_${from}_TO_${to}_TooLow`
          );
          pou.body.addLine(`${tooLowCheckMethod.name}();`);

          createOutOfRangeConvertMethodContent(
            from,
            to,
            `DatatypeLimits.${from}_MIN_VALUE`,
            tooLowCheckMethod
          );

          createValidConvertMethodContent(
            from,
            to,
            `DatatypeLimits.MIN_VALUE_OF_${from}_WHICH_CAN_BE_HELD_IN_A_${to}`,
            lowerCheckMethod
          );
        } else {
          // only generate the standard upper check
          createValidConvertMethodContent(
            from,
            to,
            `DatatypeLimits.${from}_MIN_VALUE`,
            lowerCheckMethod
          );
        }
      }
    }

    await fs.writeFile(
      path.join(testDirectory, pou.name + ".TcPOU"),
      pou.toXmlString(),
      "utf8"
    );

    fileCounter += 1;
  }

  await fs.writeFile(
    path.join(outputFolder, "Tests.txt"),
    testVariables,
    "utf8"
  );
}

async function createGVLMinsAndMax(dict) {
  let gvl = "";
  // Iterate over every member of dict and print to screen
  for (const rowKey in dict) {
    gvl += `\n// Limits of ${rowKey} used for conversions\n`;

    function createUpperLimit(from, to) {
      gvl += `MAX_VALUE_OF_${from}_WHICH_CAN_BE_HELD_IN_A_${to} : ${from} := ${to}_TO_${from}(${to}_MAX_VALUE);\n`;
    }

    function createLowerLimit(from, to) {
      gvl += `MIN_VALUE_OF_${from}_WHICH_CAN_BE_HELD_IN_A_${to} : ${from} := ${to}_TO_${from}(${to}_MIN_VALUE);\n`;
    }

    for (const colKey in dict[rowKey]) {
      if (dict[rowKey][colKey] == "MIN") {
        createLowerLimit(rowKey, colKey);
      }

      if (dict[rowKey][colKey] == "MAX") {
        createUpperLimit(rowKey, colKey);
      }

      if (dict[rowKey][colKey] == "MIN/MAX") {
        createLowerLimit(rowKey, colKey);
        createUpperLimit(rowKey, colKey);
      }
    }
  }

  await fs.writeFile(path.join(outputFolder, "GVL Additions.txt"), gvl, "utf8");
  fileCounter += 1;
}

function createValidConvertMethodContent(from, to, value, method) {
  testCounter += 1;

  method.declaration
    .addLine(`METHOD PUBLIC ${method.name}`)
    .addLine(`VAR`)
    .indent()
    .addLine(`value : ${from} := ${value};`)
    .addLine(`actual : ${to};`)
    .addLine(`converted : BOOL;`)
    .addLine(`equal : BOOL;`)
    .outdent()
    .addLine(`END_VAR`);

  method.body
    .addLine(`TEST('${method.name}');`)
    .addLine(``)
    .addLine(`// @TEST-RUN`)
    .addLine(`converted := TryConvert_${from}_TO_Destination(value, actual);`);

  if (from == to) {
    method.body.addLine(`equal := actual = value;`);
  } else {
    method.body.addLine(`equal := actual = ${from}_TO_${to}(value);`);
  }

  method.body
    .addLine(``)
    .addLine(`// @TEST-ASSERT`)
    .addLine(
      `AssertTrue(Condition := equal, Message := 'Did not convert ${from} to ${to} correctly');`
    )
    .addLine(
      `AssertTrue(Condition := converted, Message := 'Did not report ${from} to ${to} conversion was successful');`
    )
    .addLine(``)
    .addLine(`TEST_FINISHED();`);
}

function createOutOfRangeConvertMethodContent(from, to, value, method) {
  testCounter += 1;

  method.declaration
    .addLine(`METHOD PUBLIC ${method.name}`)
    .addLine(`VAR`)
    .indent()
    .addLine(`value : ${from} := ${value};`)
    .addLine(`actual : ${to};`)
    .addLine(`converted : BOOL;`)
    .outdent()
    .addLine(`END_VAR`);

  method.body
    .addLine(`TEST('${method.name}');`)
    .addLine(``)
    .addLine(`// @TEST-RUN`)
    .addLine(`converted := TryConvert_${from}_TO_Destination(value, actual);`)
    .addLine(``)
    .addLine(`// @TEST-ASSERT`)
    .addLine(
      `AssertFalse(Condition := converted, Message := 'Did not report ${from} to ${to} conversion was prevented');`
    )
    .addLine(``)
    .addLine(`TEST_FINISHED();`);
}

// ------------------------------------------------------------------------------------
// Classes

class StructuredTextBuilder {
  constructor() {
    this.lines = [];
    this.indentLevel = 0;
    this.indentString = "\t";
  }

  addLine(line) {
    const indentedLine = this.indentString.repeat(this.indentLevel) + line;
    this.lines.push(indentedLine);
    return this;
  }

  addLines(lines) {
    for (const line of lines) {
      this.addLine(line);
    }
    return this;
  }

  indent() {
    this.indentLevel++;
    return this;
  }

  outdent() {
    if (this.indentLevel > 0) {
      this.indentLevel--;
    }
    return this;
  }

  toString() {
    return this.lines.join("\n");
  }
}

class PouBuilder {
  constructor(name) {
    this.name = name;
    this.declaration = new StructuredTextBuilder();
    this.body = new StructuredTextBuilder();
    this.methods = [];
    this.guid = uuidv4();
  }

  addMethod(name) {
    const method = {
      name: name,
      declaration: new StructuredTextBuilder(),
      body: new StructuredTextBuilder(),
      guid: uuidv4(),
    };
    this.methods.push(method);
    return method;
  }

  toXmlString() {
    let methodsXml = "";
    for (const method of this.methods) {
      methodsXml += `
      <Method Name="${method.name}" Id="{${method.guid}}">
        <Declaration><![CDATA[${method.declaration.toString()}]]></Declaration>
        <Implementation>
          <ST><![CDATA[${method.body.toString()}]]></ST>
        </Implementation>
      </Method>
    `;
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<TcPlcObject Version="1.1.0.1" ProductVersion="3.1.4024.12">
  <POU Name="${this.name}" Id="{${this.guid}}" SpecialFunc="None">
      <Declaration><![CDATA[${this.declaration.toString()}]]></Declaration>
      <Implementation>
          <ST><![CDATA[${this.body.toString()}]]></ST>
      </Implementation>
      ${methodsXml}
  </POU>
</TcPlcObject>
`;
    return xml;
  }
}

// // function uuidv4() {
// //   // Generate a random 8-digit hexadecimal number
// //   const s4 = () =>
// //     Math.floor((1 + Math.random()) * 0x10000000)
// //       .toString(16)
// //       .substring(1);
// //   // Combine four random hexadecimal numbers with hyphens
// //   return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
// // }
