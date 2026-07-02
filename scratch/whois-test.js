import net from 'net';

const domain = 'knight1.space';
const server = 'whois.nic.space'; // standard WHOIS server for .space

const socket = new net.Socket();
socket.connect(43, server, () => {
  socket.write(domain + '\r\n');
});

let response = '';
socket.on('data', (data) => {
  response += data.toString();
});

socket.on('end', () => {
  console.log(response);
});

socket.on('error', (err) => {
  console.error('Socket error:', err);
});
