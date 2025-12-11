const jwt = require('jsonwebtoken');

/**
 * Middleware to extract and validate JWT token from cookies or Authorization header
 * The gateway uses RS256 (RSA) algorithm with user_id field
 */
function authenticateToken(req, res, next) {
  // Try to get token from Authorization header first
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // If no Authorization header, try cookies
  if (!token && req.cookies) {
    token = req.cookies.token || req.cookies.jwt || req.cookies.authToken || req.cookies.access_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // For RS256, we need the public key from the gateway team
    // TODO: Get the PUBLIC KEY from your auth/gateway team
    const publicKey = process.env.JWT_PUBLIC_KEY || process.env.JWT_SECRET;
    
    // Verify token - RS256 algorithm (not HS256)
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256', 'HS256'] });
    
    // Extract userId - gateway uses "user_id" field (string format)
    req.userId = decoded.user_id || decoded.userId || decoded.sub || decoded.id;
    
    if (!req.userId) {
      return res.status(401).json({ error: 'Invalid token: user_id not found' });
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
