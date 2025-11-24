require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const cron = require('node-cron');

const bot = new Telegraf(process.env.BOT_TOKEN);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('دیتابیس وصل شد ✅'))
  .catch(err => console.log('خطا در دیتابیس:', err));

const CarSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  username: String,
  carName: { type: String, required: true },
  currentKm: { type: Number, default: 0 },
  oilLastKm: { type: Number, default: 0 },
  oilLastDate: Date,
  brakePadsDate: Date,
  timingBeltKm: Number,
  timingBeltDate: Date,
  alternatorBeltDate: Date,
  acBeltDate: Date,
  batteryDate: Date,
  brakeFluidKm: Number,
  brakeFluidDate: Date,
  history: [{ action: String, date: Date, km: Number }]
});

const Car = mongoose.model('Car', CarSchema);
const wizard = {};
let selectedCar = {};

const mainMenu = Markup.keyboard([
  ['ماشین‌های من', 'اضافه کردن ماشین'],
  ['وضعیت ماشین', 'تعویض روغن'],
  ['بروزرسانی کیلومتر', 'تاریخچه سرویس‌ها']
]).resize();

bot.start(async (ctx) => {
  const cars = await Car.find({ userId: ctx.from.id });
  if (cars.length === 0) {
    ctx.reply('سلام! 🚗\nبه ربات مدیریت سرویس ماشین خوش اومدی!\nاول یه ماشین اضافه کن:', Markup.keyboard([['اضافه کردن ماشین']]).resize());
  } else {
    ctx.reply(`سلام ${ctx.from.first_name || ''}! 👋`, mainMenu);
  }
});

bot.hears('ماشین‌های من', async (ctx) => {
  const cars = await Car.find({ userId: ctx.from.id });
  if (cars.length === 0) return ctx.reply('ماشینی نداری!');
  const buttons = cars.map(c => [`${c.carName} (${c.currentKm} km)`]);
  buttons.push(['اضافه کردن ماشین']);
  ctx.reply('ماشین‌هات:', Markup.keyboard(buttons).resize());
});

bot.hears('اضافه کردن ماشین', (ctx) => {
  wizard[ctx.from.id] = { step: 'add_car' };
  ctx.reply('اسم ماشین رو بنویس (مثلاً: 206 سفید):', Markup.removeKeyboard());
});

bot.hears(/^(?!.*اضافه کردن ماشین).*$/, async (ctx) => {
  if (wizard[ctx.from.id]?.step === 'add_car') {
    await new Car({ userId: ctx.from.id, carName: ctx.message.text, username: ctx.from.username }).save();
    delete wizard[ctx.from.id];
    ctx.reply('ماشین اضافه شد! 🎉', mainMenu);
    return;
  }
  const carName = ctx.message.text.split(' (')[0];
  const car = await Car.findOne({ userId: ctx.from.id, carName });
  if (car) {
    selectedCar[ctx.from.id] = car;
    ctx.reply(`ماشین انتخاب شد: ${car.carName}\nکیلومتر فعلی: ${car.currentKm} km`, mainMenu);
  }
});

bot.hears('وضعیت ماشین', async (ctx) => {
  const car = selectedCar[ctx.from.id] || await Car.findOne({ userId: ctx.from.id });
  if (!car) return ctx.reply('اول ماشین اضافه کن!');
  const oilPassed = car.currentKm - car.oilLastKm;
  const oilStatus = oilPassed >= 4800 ? 'نزدیک تعویض!' : 'خوبه';
  ctx.reply(`وضعیت ${car.carName}\n\nکیلومتر فعلی: ${car.currentKm} km\nروغن: ${oilPassed} km گذشته → ${oilStatus}`);
});

bot.hears('تعویض روغن', async (ctx) => {
  const car = selectedCar[ctx.from.id] || await Car.findOne({ userId: ctx.from.id });
  if (!car) return ctx.reply('ماشین انتخاب کن!');
  car.oilLastKm = car.currentKm;
  car.oilLastDate = new Date();
  car.history.push({ action: 'تعویض روغن', date: new Date(), km: car.currentKm });
  await car.save();
  ctx.reply('روغن تعویض شد! تا ۵۰۰۰ km دیگه هشدار میدم ✅');
});

bot.hears('بروزرسانی کیلومتر', (ctx) => {
  wizard[ctx.from.id] = { step: 'update_km' };
  ctx.reply('کیلومتر فعلی چنده؟ (فقط عدد بفرست)');
});

bot.on('text', async (ctx) => {
  if (wizard[ctx.from.id]?.step === 'update_km') {
    const km = parseInt(ctx.message.text);
    if (!isNaN(km)) {
      const car = selectedCar[ctx.from.id] || await Car.findOne({ userId: ctx.from.id });
      if (car) {
        car.currentKm = km;
        await car.save();
        ctx.reply(`کیلومتر بروز شد: ${km} km ✅`, mainMenu);
      }
    }
    delete wizard[ctx.from.id];
  }
});

// هشدار روزانه روغن
cron.schedule('0 10 * * *', async () => {
  const cars = await Car.find({});
  for (let car of cars) {
    const left = 5000 - (car.currentKm - car.oilLastKm);
    if (left > 0 && left <= 500) {
      bot.telegram.sendMessage(car.userId, `هشدار روغن!\nماشین: ${car.carName}\nفقط ${left} km مونده!`);
    }
  }
});

bot.launch();
console.log('ربات ۲۴ ساعته روشن شد 🚀');
