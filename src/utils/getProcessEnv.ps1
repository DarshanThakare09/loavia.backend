# PowerShell script to read environment variables of another process on Windows
param([int]$ProcessId)

$source = @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.ComponentModel;

public class ProcessEnvReader {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("ntdll.dll", SetLastError = true)]
    public static extern int NtQueryInformationProcess(IntPtr ProcessHandle, int ProcessInformationClass, ref PROCESS_BASIC_INFORMATION ProcessInformation, int ProcessInformationLength, ref int ReturnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, int dwSize, out IntPtr lpNumberOfBytesRead);

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_BASIC_INFORMATION {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 2)]
        public IntPtr[] Reserved2;
        public IntPtr UniqueProcessId;
        public IntPtr Reserved3;
    }

    private const int PROCESS_QUERY_INFORMATION = 0x0400;
    private const int PROCESS_VM_READ = 0x0010;

    public static string GetEnvironmentVariables(int pid) {
        IntPtr hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
        if (hProcess == IntPtr.Zero) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to open process.");
        }

        try {
            PROCESS_BASIC_INFORMATION pbi = new PROCESS_BASIC_INFORMATION();
            int returnLength = 0;
            int status = NtQueryInformationProcess(hProcess, 0, ref pbi, Marshal.SizeOf(pbi), ref returnLength);
            if (status != 0) {
                throw new Win32Exception(status, "NtQueryInformationProcess failed.");
            }

            IntPtr pebAddr = pbi.PebBaseAddress;
            
            // Read ProcessParameters pointer from PEB
            IntPtr procParamsOffset = (IntPtr)(IntPtr.Size == 8 ? 0x20 : 0x10);
            byte[] procParamsPtrBytes = new byte[IntPtr.Size];
            IntPtr read;
            if (!ReadProcessMemory(hProcess, pebAddr + (int)procParamsOffset, procParamsPtrBytes, procParamsPtrBytes.Length, out read)) {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to read ProcessParameters pointer.");
            }
            
            IntPtr procParamsAddr = (IntPtr)BitConverter.ToInt64(procParamsPtrBytes, 0);

            // Read Environment pointer from ProcessParameters
            IntPtr envOffset = (IntPtr)(IntPtr.Size == 8 ? 0x80 : 0x48);
            byte[] envPtrBytes = new byte[IntPtr.Size];
            if (!ReadProcessMemory(hProcess, procParamsAddr + (int)envOffset, envPtrBytes, envPtrBytes.Length, out read)) {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to read Environment pointer.");
            }

            IntPtr envAddr = (IntPtr)BitConverter.ToInt64(envPtrBytes, 0);

            // Read environment block memory (read 64KB to be safe)
            byte[] envBytes = new byte[65536];
            if (!ReadProcessMemory(hProcess, envAddr, envBytes, envBytes.Length, out read)) {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to read environment block.");
            }

            // Find double null-terminator in the unicode byte array
            int length = 0;
            for (int i = 0; i < envBytes.Length - 3; i += 2) {
                if (envBytes[i] == 0 && envBytes[i + 1] == 0 && envBytes[i + 2] == 0 && envBytes[i + 3] == 0) {
                    length = i + 2;
                    break;
                }
            }

            if (length == 0) length = envBytes.Length;

            string envString = System.Text.Encoding.Unicode.GetString(envBytes, 0, length);
            return envString;
        } finally {
            CloseHandle(hProcess);
        }
    }
}
"@

Add-Type -TypeDefinition $source

try {
    $envBlock = [ProcessEnvReader]::GetEnvironmentVariables($ProcessId)
    $envBlock -split "`0" | Where-Object { $_ -ne "" } | Select-Object -First 80
} catch {
    Write-Error $_.Exception.Message
}
