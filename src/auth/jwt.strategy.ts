import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtCryptoService } from './jwt-crypto.service';

interface EncryptedJwtPayload {
  enc: string;
}

function extractJwtFromAuthHeader(req: Request): string | null {
  const authHeader = req.headers['authorization'];

  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const value = authHeader.trim();

  if (value.toLowerCase().startsWith('bearer ')) {
    return value.slice(7).trim();
  }

  return value;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtCrypto: JwtCryptoService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractJwtFromAuthHeader]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: EncryptedJwtPayload) {
    if (!payload.enc) {
      throw new UnauthorizedException();
    }

    let decrypted: { a: string; b?: string };

    try {
      const plaintext = this.jwtCrypto.decrypt(payload.enc);
      decrypted = JSON.parse(plaintext);
    } catch {
      throw new UnauthorizedException();
    }

    const userId = decrypted.a;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
