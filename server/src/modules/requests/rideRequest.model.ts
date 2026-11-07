import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { RIDE_REQUEST_STATUSES } from '../../config/constants.js';
import { pointSchema } from '../../lib/geo.js';

/**
 * A rider's *intent* to travel. It is deliberately not a booking: it carries
 * no seat reservation and can be seen by drivers as a reverse match against
 * their published ride.
 */
const rideRequestSchema = new Schema(
  {
    riderId: {
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
    /** The rider can leave this many minutes either side of `departureAt`. */
    flexMinutes: {
      type: Number,
      default: 30,
      min: 1,
      max: 240,
      required: true,
    },
    seats: {
      type: Number,
      default: 1,
      min: 1,
      max: 8,
      required: true,
    },
    /** Optional budget ceiling; requests without one match any fare. */
    maxFarePerSeat: { type: Number, min: 0, max: 10_000 },
    notes: { type: String, trim: true, maxlength: 280 },

    status: {
      type: String,
      enum: RIDE_REQUEST_STATUSES,
      default: 'open',
      required: true,
    },
    /** Set when a booking is eventually created from this intent. */
    matchedRideId: { type: Schema.Types.ObjectId, ref: 'Ride' },

    cancelledAt: { type: Date },
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

// --- Geospatial indexes: reverse matching uses the same primitives as rides --
rideRequestSchema.index({ origin: '2dsphere' });
rideRequestSchema.index({ destination: '2dsphere' });

// --- Query indexes ----------------------------------------------------------
rideRequestSchema.index({ status: 1, departureAt: 1 });
rideRequestSchema.index({ riderId: 1, createdAt: -1 });

export type RideRequest = InferSchemaType<typeof rideRequestSchema>;
export type RideRequestRecord = RideRequest & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const RideRequestModel = model('RideRequest', rideRequestSchema);
