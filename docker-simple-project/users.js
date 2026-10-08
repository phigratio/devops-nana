const express = require('express');
const { ObjectId } = require('mongodb');
const { collections } = require('./db');

const router = express.Router();

const FIELDS = ['name', 'title', 'email', 'location', 'bio', 'avatarUrl'];
const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop';

function serialize(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  // A blank email is stored as a missing field; hand the client a string either way.
  for (const field of FIELDS) rest[field] = rest[field] || '';
  return { id: _id.toString(), ...rest };
}

function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// Pulls the known fields off the body. `partial` allows a subset (PATCH);
// otherwise `name` is required (POST / PUT).
function validate(body, { partial }) {
  const data = {};

  for (const field of FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string') {
      return { error: `"${field}" must be a string` };
    }
    data[field] = body[field].trim();
  }

  if (!partial && !data.name) return { error: 'Name is required' };
  if (partial && 'name' in data && !data.name) return { error: 'Name cannot be empty' };

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { error: 'Email is not valid' };
  }
  if (data.avatarUrl && !/^https?:\/\//i.test(data.avatarUrl)) {
    return { error: 'Image URL must start with http:// or https://' };
  }

  return { data };
}

function duplicateEmail(err) {
  return err && err.code === 11000;
}

// CREATE
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = validate(req.body, { partial: false });
    if (error) return res.status(400).json({ error });

    const now = new Date();
    const doc = {
      title: '',
      location: '',
      bio: '',
      avatarUrl: DEFAULT_AVATAR,
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    if (!doc.email) delete doc.email; // keeps it out of the unique index

    const { insertedId } = await collections.users.insertOne(doc);
    res.status(201).json(serialize({ _id: insertedId, ...doc }));
  } catch (err) {
    if (duplicateEmail(err)) return res.status(409).json({ error: 'That email is already used' });
    next(err);
  }
});

// READ many
router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const filter = q
      ? { $or: ['name', 'title', 'email', 'location'].map((f) => ({ [f]: { $regex: q, $options: 'i' } })) }
      : {};

    const docs = await collections.users.find(filter).sort({ createdAt: 1 }).toArray();
    res.json(docs.map(serialize));
  } catch (err) {
    next(err);
  }
});

// READ one
router.get('/:id', async (req, res, next) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'Invalid id' });

    const doc = await collections.users.findOne({ _id });
    if (!doc) return res.status(404).json({ error: 'User not found' });

    res.json(serialize(doc));
  } catch (err) {
    next(err);
  }
});

// UPDATE (PUT replaces the editable fields, PATCH merges a subset)
async function update(req, res, next, { partial }) {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'Invalid id' });

    const { data, error } = validate(req.body, { partial });
    if (error) return res.status(400).json({ error });

    const $set = { ...data, updatedAt: new Date() };

    if (!partial) {
      // PUT: fields the caller omitted are cleared back to their defaults.
      for (const field of FIELDS) {
        if (field in $set) continue;
        $set[field] = field === 'avatarUrl' ? DEFAULT_AVATAR : '';
      }
    }

    // A cleared email is removed rather than blanked, so the unique index skips it.
    const update = { $set };
    if ($set.email === '') {
      delete $set.email;
      update.$unset = { email: '' };
    }

    const doc = await collections.users.findOneAndUpdate(
      { _id },
      update,
      { returnDocument: 'after' }
    );
    if (!doc) return res.status(404).json({ error: 'User not found' });

    res.json(serialize(doc));
  } catch (err) {
    if (duplicateEmail(err)) return res.status(409).json({ error: 'That email is already used' });
    next(err);
  }
}

router.put('/:id', (req, res, next) => update(req, res, next, { partial: false }));
router.patch('/:id', (req, res, next) => update(req, res, next, { partial: true }));

// DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    const _id = toObjectId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'Invalid id' });

    const doc = await collections.users.findOneAndDelete({ _id });
    if (!doc) return res.status(404).json({ error: 'User not found' });

    res.json({ deleted: serialize(doc) });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, DEFAULT_AVATAR };
