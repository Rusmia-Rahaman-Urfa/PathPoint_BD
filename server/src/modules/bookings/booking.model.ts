import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { BOOKING_STATUSES } from '../../config/constants.js';

const bookingSchema = new Schema(
  {
    rideId: {
      type: Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
    },
    riderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** Denormalised so "bookings received" never needs a join. */
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    seats: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    /** Fare snapshot at booking time; later ride edits cannot rewrite history. */
    farePerSeat: {
      type: Number,
      required: true,
      min: 0,
      max: 10_000,
    },
    totalFare: {
      type: Number,
      required: true,
      min: 0,
    },
    /** Snapshot used for sorting a rider's/driver's booking lists. */
    rideDepartureAt: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: BOOKING_STATUSES,
      default: 'pending',
      required: true,
    },

    /**
     * MongoDB partial indexes do not support `$ne`, so "unique unless
     * cancelled" is expressed as `active: true`. The flag mirrors
     * `status !== 'cancelled'` and is flipped atomically on cancellation,
     * which frees the `(rideId, riderId)` pair for a re-booking.
     */
    active: {
      type: Boolean,
      default: true,
      required: true,
    },

    confirmedAt: { type: Date },
    cancelledAt: { type: Date },
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

// One *active* booking per rider per ride. Cancelling sets `active: false`, so
// the same rider can book the same ride again without tripping the index.
bookingSchema.index(
  { rideId: 1, riderId: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true },
    name: 'uniq_active_booking_per_rider',
  },
);

bookingSchema.index({ rideId: 1, status: 1 });
bookingSchema.index({ riderId: 1, createdAt: -1 });
bookingSchema.index({ driverId: 1, createdAt: -1 });
bookingSchema.index({ driverId: 1, status: 1 });

// Keep the flag and the enum in sync no matter which code path writes the doc.
bookingSchema.pre('validate', function mirrorActiveFlag(next) {
  this.active = this.status !== 'cancelled';
  next();
});

export type Booking = InferSchemaType<typeof bookingSchema>;
export type BookingRecord = Booking & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const BookingModel = model('Booking', bookingSchema);
