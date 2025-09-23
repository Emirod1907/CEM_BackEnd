import { JwtPayload } from '../../libs/jwt';

declare global {
  namespace Express {
    interface Request {
      persona?: JwtPayload;
    }
  }
}