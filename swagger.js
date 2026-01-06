import swaggerAutogen from 'swagger-autogen'

// swagger stuff
const doc = {
  info: {
    title: 'WAPI',
    description: 'Whatsapp API'
  },
  host: `localhost:3000`
};
const outputFile = './swagger-output.json'
const routes = ['./index.js']

swaggerAutogen(outputFile, routes, doc)