const jwt = require('jsonwebtoken');

/**
 * Middleware to extract and validate JWT token from Authorization header
 * Extracts userId from the token and attaches it to req.userId
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Verify the token using the secret from environment variable
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret);
    
    // Extract userId from the decoded token
    // Adjust this based on your JWT payload structure (e.g., decoded.sub, decoded.userId, decoded.id)
    req.userId = decoded.userId || decoded.sub || decoded.id;
    
    if (!req.userId) {
      return res.status(401).json({ error: 'Invalid token: userId not found' });
    }
    
    next();
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional middleware - allows requests without token (for testing)
 * If token is present, validates it. If not, continues without userId.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(); // No token, continue without userId
  }

  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret);
    req.userId = decoded.userId || decoded.sub || decoded.id;
  } catch (error) {
    console.error('Optional JWT verification failed:', error.message);
    // Continue anyway for optional auth
  }
  
  next();
}

module.exports = { authenticateToken, optionalAuth };
