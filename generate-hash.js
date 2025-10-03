// File: generate-hash.js
const bcrypt = require('bcryptjs');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('--- Password Hash Generator ---');
readline.question('Please enter the admin password you want to use: ', (password) => {
  if (!password) {
    console.error('Password cannot be empty.');
    readline.close();
    return;
  }
  
  // สร้าง Hash จากรหัสผ่าน
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  console.log('\n✅ Your generated password hash is:');
  console.log('==============================================================');
  console.log(hash);
  console.log('==============================================================');
  console.log('** Please copy this entire hash and paste it into the ADMIN_PASSWORD_HASH field in your .env file. **');
  
  readline.close();
});