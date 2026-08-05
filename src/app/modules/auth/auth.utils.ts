// import jwt, { JwtPayload } from 'jsonwebtoken';

// export const createToken = (
//   jwtPayload: { userId: string; role: string },
//   secret: string,
//   expiresIn: string,
// ) => {
//   return jwt.sign(jwtPayload, secret, {
//     expiresIn,
//   });
// };

// export const verifyToken = (token: string, secret: string) => {
//   return jwt.verify(token, secret) as JwtPayload;
// };


import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export const createToken = (
  jwtPayload: { userId: string; role: string },
  secret: string,
  expiresIn: string | number,
) => {
  const options: SignOptions = {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  };
  return jwt.sign(jwtPayload, secret, options);
};

export const verifyToken = (token: string, secret: string) => {
  return jwt.verify(token, secret) as JwtPayload;
};