import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtCryptoService } from './jwt-crypto.service';

interface JwtUserPayload {
  id: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtCrypto: JwtCryptoService,
  ) {}

  signUser(user: JwtUserPayload): string {
    const innerPayload = {
      a: user.id,
      b: user.username,
    };

    const enc = this.jwtCrypto.encrypt(JSON.stringify(innerPayload));

    return this.jwtService.sign({ enc });
  }
}
