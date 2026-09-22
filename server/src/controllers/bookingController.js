import Joi from 'joi';
import { Booking } from '../models/Booking.js';

// Joi validation schema for create and update actions
const bookingValidationSchema = Joi.object({
  roomNumber: Joi.string().required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')).required().messages({
    'date.greater': 'endDate must be strictly after startDate'
  }),
  purpose: Joi.string().optional().allow('', null),
  bookedBy: Joi.string().hex().length(24).optional().allow(null)
});

// Helper function to check if date range overlaps on the same roomNumber
async function hasBookingConflict(roomNumber, startDate, endDate, excludeBookingId = null) {
  // Overlap condition: (existing.startDate < proposed.endDate) AND (existing.endDate > proposed.startDate)
  const query = {
    roomNumber,
    startDate: { $lt: new Date(endDate) },
    endDate: { $gt: new Date(startDate) }
  };

  // On update operations, exclude the current booking ID so it doesn't conflict with itself
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const conflictingBooking = await Booking.findOne(query);
  return Boolean(conflictingBooking);
}

// GET /api/bookings
export async function getAllBookings(req, res, next) {
  try {
    const bookings = await Booking.find().populate('bookedBy', 'name email');
    res.status(200).json(bookings);
  } catch (err) {
    next(err);
  }
}

// GET /api/bookings/:id
export async function getBooking(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id).populate('bookedBy', 'name email');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.status(200).json(booking);
  } catch (err) {
    next(err);
  }
}

// POST /api/bookings
export async function createBooking(req, res, next) {
  try {
    const { error, value } = bookingValidationSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({ message: 'Validation error', details: error.details.map(d => d.message) });
    }

    const isConflicting = await hasBookingConflict(value.roomNumber, value.startDate, value.endDate);
    if (isConflicting) {
      return res.status(409).json({ message: 'Requested room is already booked for the selected time range.' });
    }

    const booking = await Booking.create(value);
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/bookings/:id
export async function updateBooking(req, res, next) {
  try {
    const existingBooking = await Booking.findById(req.params.id);
    if (!existingBooking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Merge existing values with incoming updates for validation and overlap check
    const mergedData = {
      roomNumber: req.body.roomNumber ?? existingBooking.roomNumber,
      startDate: req.body.startDate ?? existingBooking.startDate.toISOString(),
      endDate: req.body.endDate ?? existingBooking.endDate.toISOString(),
      purpose: req.body.purpose ?? existingBooking.purpose,
      bookedBy: req.body.bookedBy ?? (existingBooking.bookedBy ? existingBooking.bookedBy.toString() : null)
    };

    const { error, value } = bookingValidationSchema.validate(mergedData, { abortEarly: false });
    if (error) {
      return res.status(400).json({ message: 'Validation error', details: error.details.map(d => d.message) });
    }

    const isConflicting = await hasBookingConflict(value.roomNumber, value.startDate, value.endDate, req.params.id);
    if (isConflicting) {
      return res.status(409).json({ message: 'Updated time range conflicts with an existing booking for this room.' });
    }

    const updatedBooking = await Booking.findByIdAndUpdate(req.params.id, value, { new: true, runValidators: true }).populate('bookedBy', 'name email');
    res.status(200).json(updatedBooking);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/bookings/:id
export async function deleteBooking(req, res, next) {
  try {
    const deletedBooking = await Booking.findByIdAndDelete(req.params.id);
    if (!deletedBooking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.status(200).json({ message: 'Booking deleted successfully', id: req.params.id });
  } catch (err) {
    next(err);
  }
}