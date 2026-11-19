# CloneStudio isolated build helper (Windows AppContainer + Job Object).
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI.
# Input: JSON on stdin. Output: single JSON object on stdout.
param([Parameter(Mandatory = $true)][string]$Mode)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) {
  $payload = @{}
} else {
  $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($raw.Trim()))
  $payload = $json | ConvertFrom-Json
}

$cs = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CsIso {
  [StructLayout(LayoutKind.Sequential)] public struct CAPS { public IntPtr Sid; public IntPtr Caps; public uint Count; public uint Reserved; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct SI {
    public uint cb; public string lpReserved, lpDesktop, lpTitle;
    public uint dwX,dwY,dwXSize,dwYSize,dwXCountChars,dwYCountChars,dwFillAttribute,dwFlags;
    public ushort wShowWindow,cbReserved2; public IntPtr lpReserved2;
    public IntPtr hStdInput,hStdOutput,hStdError;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct SIEX { public SI StartupInfo; public IntPtr AttrList; }
  [StructLayout(LayoutKind.Sequential)] public struct PI { public IntPtr hProcess,hThread; public uint dwProcessId,dwThreadId; }
  [StructLayout(LayoutKind.Sequential)] public struct SA { public uint nLength; public IntPtr lpSecurityDescriptor; [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle; }
  [StructLayout(LayoutKind.Sequential)] public struct IOC { public ulong R1,R2,R3,R4,R5,R6; }
  [StructLayout(LayoutKind.Sequential)] public struct JBL {
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public IntPtr Affinity; public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] public struct JEL {
    public JBL BasicLimitInformation; public IOC IoInfo;
    public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
  }
  [DllImport("userenv.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern uint CreateAppContainerProfile(string n,string d,string ds,IntPtr c,uint cc,out IntPtr s);
  [DllImport("userenv.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern uint DeriveAppContainerSidFromAppContainerName(string n,out IntPtr s);
  [DllImport("userenv.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern uint DeleteAppContainerProfile(string n);
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool ConvertSidToStringSid(IntPtr s,out IntPtr p);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool InitializeProcThreadAttributeList(IntPtr l,uint c,uint f,ref uint size);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool UpdateProcThreadAttribute(IntPtr l,uint f,UIntPtr a,IntPtr v,UIntPtr s,IntPtr p,IntPtr r);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateProcessW(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,[MarshalAs(UnmanagedType.Bool)] bool inh,uint f,IntPtr env,string cwd,ref SIEX si,out PI pi);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateFileW(string path,uint access,uint share,ref SA sa,uint creation,uint flags,IntPtr tmpl);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr h,uint ms);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetExitCodeProcess(IntPtr h,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr sa,string name);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job,int cls,IntPtr info,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool QueryInformationJobObject(IntPtr job,int cls,IntPtr info,uint size,out uint needed);
  [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateJobObject(IntPtr job,uint code);
  public static string SidText(IntPtr sid){IntPtr p; if(!ConvertSidToStringSid(sid,out p)) return ""; string s=Marshal.PtrToStringUni(p); Marshal.FreeHGlobal(p); return s;}
  public static string EnsureProfile(string name){
    IntPtr sid; uint hr=CreateAppContainerProfile(name,name,name,IntPtr.Zero,0,out sid);
    if(hr==0x800700B7) hr=DeriveAppContainerSidFromAppContainerName(name,out sid);
    if(hr!=0) throw new Exception("profile=0x"+hr.ToString("X8"));
    return SidText(sid);
  }
  public static string Derive(string name){
    IntPtr sid; uint hr=DeriveAppContainerSidFromAppContainerName(name,out sid);
    if(hr!=0) throw new Exception("derive=0x"+hr.ToString("X8"));
    return SidText(sid);
  }
  public static void DeleteProfile(string name){ DeleteAppContainerProfile(name); }
  public static string Run(string profile,string app,string cmdLine,string cwd,string outFile,string errFile,uint timeoutMs,ulong memoryMb){
    IntPtr sid; uint hr=DeriveAppContainerSidFromAppContainerName(profile,out sid);
    if(hr!=0) throw new Exception("derive=0x"+hr.ToString("X8"));
    SA sa=new SA(); sa.nLength=(uint)Marshal.SizeOf(typeof(SA)); sa.bInheritHandle=true;
    IntPtr hOut=CreateFileW(outFile,0x40000000,0x00000001|0x00000002,ref sa,2,0x00000080,IntPtr.Zero);
    IntPtr hErr=CreateFileW(errFile,0x40000000,0x00000001|0x00000002,ref sa,2,0x00000080,IntPtr.Zero);
    if(hOut==new IntPtr(-1)||hErr==new IntPtr(-1)) throw new Exception("logfile="+Marshal.GetLastWin32Error());
    uint size=0; InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
    IntPtr attr=Marshal.AllocHGlobal((int)size);
    if(!InitializeProcThreadAttributeList(attr,1,0,ref size)) throw new Exception("attrlist="+Marshal.GetLastWin32Error());
    CAPS caps=new CAPS(); caps.Sid=sid; caps.Caps=IntPtr.Zero; caps.Count=0;
    IntPtr capMem=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(CAPS)));
    Marshal.StructureToPtr(caps,capMem,false);
    if(!UpdateProcThreadAttribute(attr,0,(UIntPtr)0x00020009,capMem,(UIntPtr)(uint)Marshal.SizeOf(typeof(CAPS)),IntPtr.Zero,IntPtr.Zero)) throw new Exception("attr="+Marshal.GetLastWin32Error());
    IntPtr job=CreateJobObject(IntPtr.Zero,null);
    if(job==IntPtr.Zero) throw new Exception("job="+Marshal.GetLastWin32Error());
    JEL limits=new JEL();
    limits.BasicLimitInformation.LimitFlags=0x00002000|0x00000200|0x00000008;
    limits.BasicLimitInformation.ActiveProcessLimit=8;
    limits.JobMemoryLimit=new UIntPtr(memoryMb*1024UL*1024UL);
    IntPtr limMem=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(JEL)));
    Marshal.StructureToPtr(limits,limMem,false);
    if(!SetInformationJobObject(job,9,limMem,(uint)Marshal.SizeOf(typeof(JEL)))) throw new Exception("joblimits="+Marshal.GetLastWin32Error());
    SIEX si=new SIEX(); si.StartupInfo.cb=(uint)Marshal.SizeOf(typeof(SIEX)); si.StartupInfo.dwFlags=0x00000100; si.StartupInfo.hStdOutput=hOut; si.StartupInfo.hStdError=hErr; si.AttrList=attr;
    PI pi; bool ok=CreateProcessW(app,new StringBuilder(cmdLine),IntPtr.Zero,IntPtr.Zero,true,0x00080000|0x08000000,IntPtr.Zero,cwd,ref si,out pi);
    if(!ok) throw new Exception("createproc="+Marshal.GetLastWin32Error()+" cb="+si.StartupInfo.cb);
    if(!AssignProcessToJobObject(job,pi.hProcess)) throw new Exception("assignjob="+Marshal.GetLastWin32Error());
    uint wait=WaitForSingleObject(pi.hProcess,timeoutMs);
    bool timedOut=(wait==0x102);
    if(timedOut) TerminateJobObject(job,1);
    uint code=1; GetExitCodeProcess(pi.hProcess,out code);
    JEL peak=new JEL(); uint needed; uint peakMb=0;
    if(QueryInformationJobObject(job,9,limMem,(uint)Marshal.SizeOf(typeof(JEL)),out needed)){
      peak=(JEL)Marshal.PtrToStructure(limMem,typeof(JEL));
      peakMb=(uint)(peak.PeakJobMemoryUsed.ToUInt64()/1024UL/1024UL);
    }
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess); CloseHandle(hOut); CloseHandle(hErr);
    Marshal.FreeHGlobal(limMem); Marshal.FreeHGlobal(capMem); Marshal.FreeHGlobal(attr);
    CloseHandle(job);
    if(timedOut) code=0xFFFFFFFF;
    return "{\"code\":"+code+",\"timedOut\":"+(timedOut?"true":"false")+",\"peakMemoryMb\":"+peakMb+"}";
  }
}
'@
Add-Type -TypeDefinition $cs -Language CSharp

function Grant-Acl([string]$path, [string]$sidText, [string]$rights) {
  $spec = '*' + $sidText + ':(OI)(CI)' + $rights
  $icacls = Join-Path $env:SystemRoot 'System32\icacls.exe'
  $grantOutput = & $icacls $path /grant $spec 2>&1
  if ($LASTEXITCODE -ne 0) { throw "icacls failed for ${path}: $($grantOutput -join ' | ')" }
}

function Clear-Storage([string]$name) {
  $key = 'HKCU:\SOFTWARE\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppContainer\Storage\' + $name
  if (Test-Path -LiteralPath $key) {
    Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction SilentlyContinue
  }
}

try {
  switch ($Mode) {
    'init' {
      $name = [string]$payload.profileName
      $modulesDir = [string]$payload.modulesDir
      if (-not (Test-Path -LiteralPath $modulesDir -PathType Container)) { throw "modules dir missing: $modulesDir" }
      $sidText = [CsIso]::EnsureProfile($name)
      Grant-Acl $modulesDir $sidText 'RX'
      [Console]::Out.Write('{"sid":' + (ConvertTo-Json -InputObject $sidText -Compress) + '}')
    }
    'run' {
      $name = [string]$payload.profileName
      $sidText = [CsIso]::Derive($name)
      $workspace = [string]$payload.workspace
      Grant-Acl $workspace $sidText 'F'
      $result = [CsIso]::Run(
        $name,
        [string]$payload.app,
        [string]$payload.commandLine,
        [string]$payload.cwd,
        [string]$payload.outFile,
        [string]$payload.errFile,
        [uint32]$payload.timeoutMs,
        [uint64]$payload.memoryMb
      )
      Clear-Storage $name
      [Console]::Out.Write($result)
    }
    'cleanup' {
      $name = [string]$payload.profileName
      [CsIso]::DeleteProfile($name)
      Clear-Storage $name
      [Console]::Out.Write('{"ok":true}')
    }
    default { throw "unknown mode: $Mode" }
  }
} catch {
  [Console]::Out.Write('{"error":' + (ConvertTo-Json -InputObject $_.Exception.Message -Compress) + '}')
  exit 1
}
