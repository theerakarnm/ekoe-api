import bcrypt from 'bcrypt';
import { usersRepository } from './users.repository';
import { CreateUserDto, UpdateUserDto, GetCustomersParams } from './users.interface';
import { NotFoundError } from '../../core/errors';

export class UsersDomain {
  async getAllUsers() {
    return usersRepository.findAll();
  }

  async getUserById(id: string) {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
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

  /**
   * Get customers with order statistics
   * Applies search filtering and pagination
   */
  async getCustomersWithStats(params: GetCustomersParams) {
    // Validate and sanitize search input
    const sanitizedParams = {
      ...params,
      search: params.search?.trim() || undefined,
    };

    const result = await usersRepository.getCustomersWithStats(sanitizedParams);

    // Format currency amounts (convert cents to display format)
    const formattedData = result.data.map(customer => ({
      ...customer,
      totalSpent: customer.totalSpent, // Keep in cents for consistency
    }));

    return {
      ...result,
      data: formattedData,
    };
  }

  /**
   * Get customer detail with order history
   * Includes customer statistics and full order list
   */
  async getCustomerWithOrderHistory(id: string) {
    const customer = await usersRepository.getCustomerWithOrderHistory(id);
    
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    // Calculate additional statistics
    const completedOrders = customer.orders.filter(
      order => order.status === 'delivered'
    ).length;

    const pendingOrders = customer.orders.filter(
      order => order.status === 'pending' || order.status === 'processing'
    ).length;

    return {
      ...customer,
      statistics: {
        totalOrders: customer.orderCount,
        completedOrders,
        pendingOrders,
        totalSpent: customer.totalSpent,
        averageOrderValue: customer.orderCount > 0 
          ? Math.round(customer.totalSpent / customer.orderCount)
          : 0,
      },
    };
  }
}

export const usersDomain = new UsersDomain();
