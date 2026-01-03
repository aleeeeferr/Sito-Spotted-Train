db = db.getSiblingDB("spottedtrain");

const email = "alefer23@gmail.com";

db.users.updateOne(
  { email },
  {
    $setOnInsert: {
      _id: ObjectId("695690e9f06d6df138920bb6"),
      name: "Ale",
      email,
      passwordHash: "$2a$10$Q2GT6Kw8Vv4IIOnv4l6xLetw2MpiR6BNg8f5QOfyVgAxQqn0WE0.K",
      credit: 218.29999999999998,
      createdAt: ISODate("2026-01-01T15:21:13.361Z"),
      updatedAt: ISODate("2026-01-01T15:30:05.936Z"),
    },
  },
  { upsert: true }
);

const user = db.users.findOne({ email });
if (user) {
  const userId = user._id;

  if (db.tickets.countDocuments({ userId }) === 0) {
    db.tickets.insertMany([
      {
        userId,
        title: "Corsa singola",
        route: "Napoli - Nola",
        scope: "urbano",
        category: "ordinario",
        variant: "standard",
        tariff: "T1",
        status: "da_attivare",
        price: 1.5,
        purchasedAt: ISODate("2026-01-01T15:25:00.000Z"),
        createdAt: ISODate("2026-01-01T15:25:00.000Z"),
        updatedAt: ISODate("2026-01-01T15:25:00.000Z"),
      },
      {
        userId,
        title: "Abbonamento mensile",
        route: "Napoli - Pomigliano",
        scope: "passes",
        category: "mensile",
        variant: "standard",
        tariff: "M1",
        status: "attivo",
        price: 35,
        purchasedAt: ISODate("2026-01-01T15:00:00.000Z"),
        activatedAt: ISODate("2026-01-01T15:05:00.000Z"),
        expiresAt: ISODate("2026-01-31T15:05:00.000Z"),
        createdAt: ISODate("2026-01-01T15:00:00.000Z"),
        updatedAt: ISODate("2026-01-01T15:05:00.000Z"),
      },
    ]);
  }

  if (db.creditmovements.countDocuments({ userId }) === 0) {
    db.creditmovements.insertMany([
      {
        userId,
        amount: 250,
        type: "ricarica",
        note: "Ricarica iniziale",
        createdAt: ISODate("2026-01-01T15:10:00.000Z"),
        updatedAt: ISODate("2026-01-01T15:10:00.000Z"),
      },
      {
        userId,
        amount: 31.7,
        type: "acquisto",
        note: "Acquisto biglietti demo",
        createdAt: ISODate("2026-01-01T15:20:00.000Z"),
        updatedAt: ISODate("2026-01-01T15:20:00.000Z"),
      },
    ]);
  }
}
