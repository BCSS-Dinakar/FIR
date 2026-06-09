# FIRAudit Backend API

This is the Node.js / Express backend for the FIRAudit platform.

It is responsible for securely managing Officer authentications, storing audit records, and eventually interfacing with the AI extraction systems.

## Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (with Mongoose)
- **Security:** bcryptjs (password hashing), JSON Web Tokens (auth), HTTP-only cookies

## Available Scripts

In the project directory, you can run:

### `npm run dev`
Runs the backend in development mode using `nodemon`. The server will automatically restart if you make edits.
By default, the server runs on `http://localhost:5000`.

### `npm start`
Runs the server in production mode using `node`.

## Environment Variables
Create a `.env` file in the root of the backend directory. Refer to `.env.example` for the required keys.
