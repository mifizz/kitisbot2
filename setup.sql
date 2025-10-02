CREATE USER kitisbot WITH PASSWORD 'kitisbotstrongpassword';
CREATE DATABASE kitisbotdb OWNER kitisbot;
GRANT ALL PRIVILEGES ON DATABASE kitisbotdb TO kitisbot;