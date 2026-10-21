const serverless = require('serverless-http');
const app = require('../../server');

const serverlessHandler = serverless(app);

exports.handler = async (event, context) => {
  // Normalizar caminho caso a rota interna do Netlify seja repassada
  if (event.path && event.path.startsWith('/.netlify/functions/server')) {
    event.path = event.path.replace('/.netlify/functions/server', '') || '/';
  }
  return await serverlessHandler(event, context);
};
