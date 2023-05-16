// Import required modules
import cors from 'cors';
import axios from 'axios';
import https from 'https';
import express from 'express';

// Import celebrate, Joi, errors, and Segments from celebrate package
import { celebrate, Joi, errors, Segments } from 'celebrate';

// Initialize an express app
const app = express();

// Enable CORS for the app
app.use(cors());

// Enable JSON parsing and urlencoded data for the app
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Define the schema for the request validation
const schema = {
  [Segments.BODY]: Joi.object().keys({
    method: Joi.string().valid('get', 'post', 'delete', 'put', 'patch').required(),
    url: Joi.string().uri().required(),
    headers: Joi.object().optional(),
    data: Joi.object().optional(),
  }),
};

// Function to convert stream data to a string
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stream.on('error', (error) => reject(error));
  });
}

// Asynchronous function to handle the response and send it back
async function handleResponse(response, res) {
  const content = { urls: response.config.visitedUrls };
  if (response.headers['content-type'].includes('application/json')) {
    const responseData = await streamToString(response.data);
    try {
      const parsedData = JSON.parse(responseData);
      content.success = true;
      content.data = parsedData;
    } catch (error) {
      res.status(500).send('Error parsing JSON data');
    }
  }
  res.json(content);
}

// POST endpoint with celebrate schema validation
app.post('/', celebrate(schema), async (req, res) => {
  try {
    const axiosInstance = axios.create({});
    // Add request interceptor to keep track of visited URLs
    axiosInstance.interceptors.request.use((config) => {
      config.visitedUrls = config.visitedUrls || [];
      config.visitedUrls.push(config.url);
      return config;
    });

    // Add response interceptor to append response URL to visited URLs
    axiosInstance.interceptors.response.use((response) => {
      response.config.visitedUrls = response.config.visitedUrls || [];
      response.config.visitedUrls.push(response.request.res.responseUrl);
      return response;
    });

    const { method, url, headers, data } = req.body;

    const options = {
      method,
      headers: headers || {},
      url,
      data: data ? data : undefined,
      responseType: 'stream',
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    };

    const response = await axiosInstance(options);

    handleResponse(response, res);
  } catch (err) {
    console.error(err);
    if (err.response) {
      err.response.data.pipe(res);
    } else {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// Use errors middleware from celebrate package
app.use(errors());

// Export the app
export default app;
