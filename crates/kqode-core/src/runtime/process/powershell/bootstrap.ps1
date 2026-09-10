[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$source = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('__KQODE_SCRIPT__'))
$parsed = [scriptblock]::Create($source)
$ast = $parsed.Ast
if ($ast.BeginBlock -or $ast.ProcessBlock -or $ast.DynamicParamBlock -or $ast.CleanBlock -or ($ast.EndBlock -and -not $ast.EndBlock.Unnamed)) {
    throw 'KQode PowerShell commands do not support top-level named script blocks.'
}
$bodyOffset = 0
foreach ($statement in $ast.UsingStatements) {
    $bodyOffset = [Math]::Max($bodyOffset, $statement.Extent.EndOffset)
}
if ($ast.ParamBlock) {
    $bodyOffset = [Math]::Max($bodyOffset, $ast.ParamBlock.Extent.EndOffset)
}
$header = $source.Substring(0, $bodyOffset)
$body = $source.Substring($bodyOffset)
$global:__KqodeShellSucceeded = $true
$guarded = $header + "`ntry {`n" + $body + "`n} finally { `$global:__KqodeShellSucceeded = `$? }"
& ([scriptblock]::Create($guarded))
$invocationSucceeded = $?
if (-not $invocationSucceeded -or -not $global:__KqodeShellSucceeded) {
    exit 1
}
