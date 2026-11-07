import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { USER_ROLES, BD_PHONE_REGEX } from '../../config/constants.js';
import { pointSchema } from '../../lib/geo.js';

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: {
      type: String,
      match: [BD_PHONE_REGEX, 'Phone must be a valid Bangladeshi number (+8801XXXXXXXXX)'],
    },
    passwordHash: {
      type: String,
      required: true,
      // Never returned by default - login must explicitly opt in.
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'rider',
      required: true,
    },
    homeLocation: {
      type: pointSchema,
      required: false,
    },
    ratingAvg: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

// Partial index keeps phone optional while remaining unique when present.
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ homeLocation: '2dsphere' }, { sparse: true });

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model('User', userSchema);

/** Shape safe to expose over the API. */
export const PUBLIC_USER_PROJECTION = '_id name email phone role homeLocation ratingAvg ratingCount isActive createdAt updatedAt';
