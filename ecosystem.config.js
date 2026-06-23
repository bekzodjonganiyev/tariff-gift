module.exports = {
  apps: [
    {
      name: "tariff-gift",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/var/www/tariff-gift",
      instances: 1,              // yoki "max" — barcha CPU yadrolari uchun
      exec_mode: "fork",         // cluster ishlatsangiz "cluster"
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};