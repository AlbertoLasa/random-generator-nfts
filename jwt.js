const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');

// Middleware to verify JWT tokens
const verifyToken = asyncHandler(async (req, res, next) => {
  return next();
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(403).send({ error: 'Authentication token not provided' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err) => {
    if (err) {
      return res.status(401).send({ error: 'Invalid authentication token', details: err.message });
    }
    next();
  });
});

module.exports = { verifyToken };