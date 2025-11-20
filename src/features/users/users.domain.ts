import bcrypt from 'bcrypt';
import { usersRepository } from './users.repository';
import { CreateUserDto, UpdateUserDto } from './users.interface';

export class UsersDomain {
  async getAllUsers() {
    return usersRepository.findAll();
  }

  async getUserById(id: string) {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async createUser(data: CreateUserDto) {
    const existingUser = await usersRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    return usersRepository.create({
      ...data,
      password: hashedPassword,
    });
  }

  async updateUser(id: string, data: UpdateUserDto) {
    await this.getUserById(id); // Ensure user exists
    return usersRepository.update(id, data);
  }

  async deleteUser(id: string) {
    await this.getUserById(id); // Ensure user exists
    return usersRepository.delete(id);
  }
}

export const usersDomain = new UsersDomain();
