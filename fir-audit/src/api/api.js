import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  withCredentials: true, // Auto-send cookies in requests and accept cookies on responses
  headers: {
    'Content-Type': 'application/json'
  }
});

export default API;
