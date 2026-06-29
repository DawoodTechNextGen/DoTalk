const bcrypt = require('bcrypt');

const hash = '$2b$10$vWdNuE5tP55yR5tJ.C7F8u1L7vWvEqH7Dq0fR4J/w9K8EwW2pbe/K';
const password = 'password123';

bcrypt.compare(password, hash).then((res) => {
  console.log('Comparison result for password123:', res);
});

bcrypt.hash(password, 10).then((newHash) => {
  console.log('New hash generated for password123:', newHash);
  bcrypt.compare(password, newHash).then((res2) => {
    console.log('Comparison of new hash:', res2);
  });
});
