import { exec } from 'child_process';

const queryReg = (key) => {
  return new Promise((resolve) => {
    exec(`reg query "${key}" /s`, (error, stdout, stderr) => {
      resolve({ key, stdout, stderr, error });
    });
  });
};

async function main() {
  const keys = [
    'HKCU\\Software\\FlyFrogLLC',
    'HKLM\\Software\\FlyFrogLLC',
    'HKCU\\Software\\Happ',
    'HKLM\\Software\\Happ'
  ];

  for (const k of keys) {
    console.log(`\n=== Querying Registry Key: ${k} ===`);
    const res = await queryReg(k);
    if (res.error) {
      console.log('Error or Key not found.');
    } else {
      console.log(res.stdout);
    }
  }
}

main();
