import { ConflictException, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async register(username: string): Promise<{ token: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      throw new ConflictException('Username already exists');
    }

    const userId = ulid();

    const user = await this.prisma.user.create({
      data: { id: userId, username },
    });

    const token = this.authService.signUser({
      id: user.id,
      username: user.username,
    });

    return { token };
  }
}
