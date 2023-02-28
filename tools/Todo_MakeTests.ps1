cls

$savedir = "C:\temp\Autogen\"

$toa = @('DT','TOD','TIME','DATE','STRING','BOOL','BYTE','DINT','WORD','DWORD','LWORD','LREAL','INT','LINT','REAL','SINT','UDINT','UINT','ULINT','USINT')

$toa = $toa | sort

$fbName = 
"Converters_TestSuit"

$fbDeclaration = 
"FUNCTION_BLOCK PUBLIC "+$fbName+" EXTENDS TcUnit.FB_TestSuite
VAR
END_VAR
"

$fbImplementation = ""
$methodXml = ""

For ($j=0; $j -lt $toa.Length; $j++) {
    $to = $toa[$j]

$type = $to

if ($type -eq 'tod') {
$type = 'TIMEOFDAY'
}

if ($type -eq 'dt') {
$type = 'DATEANDTIME'
}

$methodName = "CheckSourceToDestinationUsing" +$to

$methodDeclaration = "METHOD PUBLIC "+$methodName+"
VAR
	in : "+$to+" := TRUE;
"

For ($j=0; $j -lt $toa.Length; $j++) {
    $to = $toa[$j]

$type = $to

if ($type -eq 'tod') {
$type = 'TIMEOFDAY'
}

if ($type -eq 'dt') {
$type = 'DATEANDTIME'
}


}


$methodImplementation = ""


$body2 = $body2 +  "	__SYSTEM.TYPE_CLASS.TYPE_"+$type+":
	    memcpy(ADR(_"+$to+"),in.pValue,in.diSize);
		convertResult := Convert_"+$to+"_To_Destination(_"+$to+", out);

"	
$methodGuid = New-Guid
$methodXml = $methodXml + "<Method Name=`""+$methodName+"`" Id=`"{"+$methodGuid+"}`">
      <Declaration><![CDATA["+$methodDeclaration+"]]></Declaration>
      <Implementation>
        <ST><![CDATA["+$methodImplementation+"]]></ST>
      </Implementation>
    </Method>
"

}


$fbGuid = New-Guid
$xml = 
"<?xml version=`"1.0`" encoding=`"utf-8`"?>
<TcPlcObject Version=`"1.1.0.1`" ProductVersion=`"3.1.4024.12`">
  <POU Name=`""+$fbName+"`" Id=`"{"+$fbGuid+"}`" SpecialFunc=`"None`">
    <Declaration><![CDATA["+$fbDeclaration+"]]></Declaration>
    <Implementation>
      <ST><![CDATA["+$fbImplementation+"]]></ST>
    </Implementation>
    <Method Name=`""+$methodName+"`" Id=`"{"+$methodGuid+"}`">
      <Declaration><![CDATA["+$methodDeclaration+"]]></Declaration>
      <Implementation>
        <ST><![CDATA["+$methodImplementation+"]]></ST>
      </Implementation>
    </Method>
  </POU>
</TcPlcObject>"

#write-host($body)

Out-File -FilePath "$savedir$fbName.TcPOU" -encoding utf8 -InputObject $xml