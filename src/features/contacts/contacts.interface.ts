// Contact form interfaces

export interface CreateContactDto {
  name: string;
  email: string;
  topic: string;
  message: string;
}

export interface UpdateContactStatusDto {
  status: 'unread' | 'read' | 'responded';
}

export interface ContactListParams {
  page?: number;
  limit?: number;
  status?: 'unread' | 'read' | 'responded';
  search?: string;
}

export interface ContactListResponse {
  contacts: ContactResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ContactResponse {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: 'unread' | 'read' | 'responded';
  createdAt: Date;
  updatedAt: Date;
  readAt: Date | null;
}
