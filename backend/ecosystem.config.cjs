module.exports = {
  apps: [
    {
      name: 'sharele-backend',
      cwd: 'D:/webDevelop/sharele/backend',
      script: 'src/index.js',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
}
