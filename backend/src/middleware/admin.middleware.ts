import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../auth.service';

// We need to extend the Express Request type to hold our user object
export interface AuthenticatedRequest extends Request {
  user?: any; // We'll attach the user object here
}

export const adminRequired = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // 1. Get the user (this now includes the 'is_admin' flag)
    const user = await AuthService.getUser(token);

    // 2. Check if the user is an admin
    if (!user.is_admin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // 3. If they are an admin, attach the user object to the request
    //    and allow them to proceed to the next function.
    req.user = user;
    next();

  } catch (err: any) {
    console.error('Admin middleware error:', err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};