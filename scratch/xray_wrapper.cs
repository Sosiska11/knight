using System;
using System.IO;
using System.Diagnostics;
using System.Text;
using System.Threading;

class Program
{
    static void Main(string[] args)
    {
        string logPath = @"C:\Users\alexs\AppData\Local\Happ\logs\xray_intercept.log";
        string targetExe = @"C:\Program Files\FlyFrogLLC\Happ\core\xray_original.exe";
        
        try
        {
            StringBuilder log = new StringBuilder();
            log.AppendLine("=== XRAY INTERCEPT ===");
            log.AppendLine("Time: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"));
            log.AppendLine("Args: " + string.Join(" ", args));
            
            string input = "";
            if (Console.IsInputRedirected)
            {
                using (StreamReader reader = new StreamReader(Console.OpenStandardInput(), Console.InputEncoding))
                {
                    input = reader.ReadToEnd();
                }
            }
            log.AppendLine("Stdin Length: " + input.Length);
            if (input.Length > 0)
            {
                log.AppendLine("Stdin Content:");
                log.AppendLine(input);
            }
            log.AppendLine("======================");
            log.AppendLine();
            
            File.AppendAllText(logPath, log.ToString());
            
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = targetExe;
            psi.Arguments = string.Join(" ", args);
            psi.UseShellExecute = false;
            psi.RedirectStandardInput = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
            
            using (Process p = Process.Start(psi))
            {
                if (input.Length > 0)
                {
                    using (StreamWriter writer = p.StandardInput)
                    {
                        writer.Write(input);
                    }
                }
                
                var outThread = new Thread(() => {
                    byte[] buffer = new byte[4096];
                    int read;
                    using (Stream src = p.StandardOutput.BaseStream)
                    using (Stream dest = Console.OpenStandardOutput())
                    {
                        while ((read = src.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            dest.Write(buffer, 0, read);
                        }
                    }
                });
                
                var errThread = new Thread(() => {
                    byte[] buffer = new byte[4096];
                    int read;
                    using (Stream src = p.StandardError.BaseStream)
                    using (Stream dest = Console.OpenStandardError())
                    {
                        while ((read = src.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            dest.Write(buffer, 0, read);
                        }
                    }
                });
                
                outThread.Start();
                errThread.Start();
                
                p.WaitForExit();
                outThread.Join();
                errThread.Join();
                
                Environment.Exit(p.ExitCode);
            }
        }
        catch (Exception ex)
        {
            File.AppendAllText(logPath, "ERROR: " + ex.ToString() + "\n");
            Environment.Exit(1);
        }
    }
}
