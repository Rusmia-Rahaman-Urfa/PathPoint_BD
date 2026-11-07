import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { RIDE_STATUSES } from '../../config/constants.js';
import { pointSchema } from '../../lib/geo.js';

const vehicleSchema = new Schema(
  {
    make: { type: String, required: true, trim: true, maxlength: 40 },
    model: { type: String, required: true, trim: true, maxlength: 40 },
    plate: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
    ac: { type: Boolean, default: false },
  },
  { _id: false },
);

const preferencesSchema = new Schema(
  {
    genderPreference: {
      type: String,
      enum: ['any', 'female', 'male'],
      default: 'any',
    },
    maxDetourMeters: {
      type: Number,
      default: 3_000,
      min: 0,
      max: 20_000,
    },
  },
  { _id: false },
);

const rideSchema = new Schema(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    origin: {
      type: pointSchema,
      required: [true, 'origin is required'],
    },
    destination: {
      type: pointSchema,
      required: [true, 'destination is required'],
    },
    originAddress: { type: String, trim: true, maxlength: 160 },
    destinationAddress: { type: String, trim: true, maxlength: 160 },

    departureAt: {
      type: Date,
      required: [true, 'departureAt is required'],
    },

    seatsTotal: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    seatsAvailable: {
      type: Number,
      required: true,
      min: 0,
      max: 8,
    },

    farePerSeat: {
      type: Number,
      required: true,
      min: 0,
      max: 10_000,
    },

    vehicle: { type: vehicleSchema, required: false },
    preferences: { type: preferencesSchema, required: false },

    status: {
      type: String,
      enum: RIDE_STATUSES,
      default: 'published',
      required: true,
    },

    cancelledAt: { type: Date, required: false },
    cancellationReason: { type: String, trim: true, maxlength: 280 },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  },
);

// --- Geospatial indexes: the backbone of commute matching -------------------
rideSchema.index({ origin: '2dsphere' });
rideSchema.index({ destination: '2dsphere' });

// --- Query indexes ----------------------------------------------------------
rideSchema.index({ status: 1, departureAt: 1 });
rideSchema.index({ driverId: 1, departureAt: -1 });

// A driver can never advertise more free seats than the car physically has.
rideSchema.pre('validate', function enforceSeatInvariant(next) {
  if (typeof this.seatsTotal === 'number' && typeof this.seatsAvailable === 'number') {
    if (this.seatsAvailable > this.seatsTotal) {
      this.invalidate('seatsAvailable', 'seatsAvailable cannot exceed seatsTotal');
    }
  }
  next();
});

export type Ride = InferSchemaType<typeof rideSchema>;
export type RideRecord = Ride & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const RideModel = model('Ride', rideSchema);
