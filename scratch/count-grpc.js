import axios from 'axios';

async function run() {
  const fileNumbers = [1, 2, 3, 4, 5];
  let totalDe = 0;
  let totalNl = 0;
  let grpcDe = 0;
  let grpcNl = 0;

  for (const num of fileNumbers) {
    const url = `https://github.com/AvenCores/goida-vpn-configs/raw/refs/heads/main/githubmirror/${num}.txt`;
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const lines = response.data.split('\n');

      for (let line of lines) {
        line = line.trim();
        if (!line.startsWith('vless://')) continue;

        const parts = line.split('#');
        if (parts.length < 2) continue;
        const remark = decodeURIComponent(parts[1]);
        const lowerRemark = remark.toLowerCase();

        const isDE = lowerRemark.includes('германия') || lowerRemark.includes('germany') || /\bde\b/i.test(remark) || remark.includes('🇩🇪');
        const isNL = lowerRemark.includes('нидерланды') || lowerRemark.includes('netherlands') || /\bnl\b/i.test(remark) || remark.includes('🇳🇱');

        if (isDE) {
          totalDe++;
          if (line.includes('type=grpc')) grpcDe++;
        }
        if (isNL) {
          totalNl++;
          if (line.includes('type=grpc')) grpcNl++;
        }
      }
    } catch (e) {
      console.log(`Failed to fetch ${num}.txt`);
    }
  }

  console.log(`DE total: ${totalDe}, DE gRPC: ${grpcDe}`);
  console.log(`NL total: ${totalNl}, NL gRPC: ${grpcNl}`);
}

run().catch(console.error);
