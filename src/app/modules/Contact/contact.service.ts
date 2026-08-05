import AppError from "../../error/AppError";
import { sendEmail } from "../../utils/mailSender";
import { Admin } from "../Dashboard/admin/admin.model";
import { ContactQueryParams, ContactStats, CreateContactDto, IContactDocument, PaginationMeta, UpdateContactStatusDto } from "./contact.interface";
import { Contact } from "./contact.model";
import  httpStatus from 'http-status';

// Create new contact
const createContact = async (
  dto: CreateContactDto,
  ipAddress?: string,
  userId?: string
): Promise<IContactDocument> => {
  const contact = await Contact.create({
    phoneNumber: dto.phoneNumber,
    email: dto.email || null,
    message: dto.message,
    ipAddress: ipAddress || null,
    status: "pending",
    user: userId,
  });

  return contact;
};

// Get all contacts with pagination & filter
const getAllContacts = async (
  params: ContactQueryParams
): Promise<{ contacts: IContactDocument[]; pagination: PaginationMeta }> => {
  const page = params.page || 1;
  const limit = params.limit || 10;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (params.status) {
    filter.status = params.status;
  }

  const [contacts, total] = await Promise.all([
    Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Contact.countDocuments(filter),
  ]);

  const pagination: PaginationMeta = {
    total,
    page,
    limit,
    totalPage: Math.ceil(total / limit),
  };

  return { contacts, pagination };
};

// Get single contact by ID (auto-mark as read)
const getContactById = async (id: string): Promise<IContactDocument | null> => {
  const contact = await Contact.findById(id);

  if (!contact) return null;

  if (contact.status === "pending") {
    contact.status = "read";
    await contact.save();
  }

  return contact;
};

// Update contact status
const updateStatus = async (
  id: string,
  dto: UpdateContactStatusDto
): Promise<IContactDocument | null> => {
  const contact = await Contact.findByIdAndUpdate(
    id,
    { status: dto.status },
    { new: true, runValidators: true }
  );

  return contact;
};

// Delete contact
const deleteContact = async (id: string): Promise<boolean> => {
  const result = await Contact.findByIdAndDelete(id);
  return result !== null;
};

// Get contact stats
const getStats = async (): Promise<ContactStats> => {
  const [total, pending, read, replied] = await Promise.all([
    Contact.countDocuments(),
    Contact.countDocuments({ status: "pending" }),
    Contact.countDocuments({ status: "read" }),
    Contact.countDocuments({ status: "replied" }),
  ]);

  return { total, pending, read, replied };
};






const sendMessageToAdmin = async (payload: {
  email: string
  phoneNumber: string
  whatsappNumber: string
  message: string
}) => {
  const { email, phoneNumber, whatsappNumber, message } = payload

  // ✅ Admin model থেকে email নাও
  const admin = await Admin.findOne({ role: { $in: ['admin', 'super_admin'] } })
  if (!admin) {
    throw new AppError(httpStatus.NOT_FOUND, 'Admin email not found')
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .header { background: #F5A623; padding: 24px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 22px; }
        .body { padding: 24px; }
        .field {
          background: #f9f9f9;
          border-radius: 8px;
          padding: 14px 18px;
          margin-bottom: 16px;
        }
        .label {
          font-size: 12px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        .value { font-size: 15px; color: #222; font-weight: 600; }
        .footer {
          text-align: center;
          padding: 16px;
          font-size: 12px;
          color: #aaa;
          border-top: 1px solid #eee;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📩 New Contact Message</h1>
        </div>
        <div class="body">
          <div class="field">
            <div class="label">User Email</div>
            <div class="value">${email}</div>
          </div>
          <div class="field">
            <div class="label">Phone Number</div>
            <div class="value">${phoneNumber}</div>
          </div>
          <div class="field">
            <div class="label">WhatsApp Number</div>
            <div class="value">${whatsappNumber}</div>
          </div>
          <div class="field">
            <div class="label">Message</div>
            <div class="value">${message}</div>
          </div>
        </div>
        <div class="footer">
          This message was sent from the Contact Us form in the app.
        </div>
      </div>
    </body>
    </html>
  `

  await sendEmail(admin.email, 'New Contact Us Message', html)

  return { success: true, message: 'Message sent successfully' }
}



export const ContactService = {
  createContact,
  getAllContacts,
  getContactById,
  updateStatus,
  deleteContact,
  getStats,
  sendMessageToAdmin,
};