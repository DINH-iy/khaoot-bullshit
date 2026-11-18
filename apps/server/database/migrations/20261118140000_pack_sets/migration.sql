-- Pack sets and items the owner makes (Admin → Chips & packs), and site settings (the chip economy).
-- CreateTable
CREATE TABLE "pack_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(60) NOT NULL,
    "price" INTEGER NOT NULL,
    "onSale" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "chances" JSONB NOT NULL,
    "godPackOdds" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pack_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pack_items" (
    "key" VARCHAR(40) NOT NULL,
    "setId" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "emoji" VARCHAR(16) NOT NULL DEFAULT '',
    "rarity" VARCHAR(12) NOT NULL,
    "flavor" VARCHAR(120) NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "retiredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pack_items_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "key" VARCHAR(40) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "pack_items_setId_idx" ON "pack_items"("setId");

-- AddForeignKey
ALTER TABLE "pack_items" ADD CONSTRAINT "pack_items_setId_fkey" FOREIGN KEY ("setId") REFERENCES "pack_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sane values only.
ALTER TABLE pack_sets ADD CONSTRAINT pack_sets_valid CHECK (price >= 0 AND "godPackOdds" >= 0 AND jsonb_typeof(chances) = 'object');
ALTER TABLE pack_items ADD CONSTRAINT pack_items_valid_rarity CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'));

-- The first two sets, as they were in the code: "Party legends" (on sale) and "Classics" (the first items, no longer sold).
INSERT INTO pack_sets (id, name, price, "onSale", "sortOrder", chances, "godPackOdds") VALUES ('7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Party legends', 100, true, 0, '{"common":70,"rare":22,"epic":7,"legendary":1}', 500);
INSERT INTO pack_sets (id, name, price, "onSale", "sortOrder", chances, "godPackOdds") VALUES ('7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Classics', 100, false, 1, '{"common":70,"rare":22,"epic":7,"legendary":1}', 0);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('disco-cat', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Disco Cat', '🐱', 'common', 'Nine lives, all spent on the dance floor.', 0);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('karaoke-frog', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Karaoke Frog', '🐸', 'common', 'Knows one song. Sings it anyway.', 1);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('party-penguin', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Party Penguin', '🐧', 'common', 'Always brings the ice.', 2);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('confetti-cannon', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Confetti Cannon', '🎉', 'common', 'Cleaning up is tomorrow’s problem.', 3);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('boom-box', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Boom Box', '📻', 'common', 'Volume knob stuck on eleven.', 4);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('neon-shades', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Neon Shades', '🕶️', 'common', 'Worn indoors, at night, on purpose.', 5);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('dj-octopus', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'DJ Octopus', '🐙', 'rare', 'Eight arms, eight decks, zero breaks.', 6);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('mirror-ball', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Mirror Ball', '🪩', 'rare', 'Turns any kitchen into a club.', 7);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('golden-mic', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Golden Mic', '🎤', 'rare', 'Drop it only after the win.', 8);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('party-bus', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Party Bus', '🚌', 'rare', 'Next stop: wherever the music is.', 9);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('karaoke-kraken', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Karaoke Kraken', '🦑', 'epic', 'Rises from the deep for the chorus.', 10);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('disco-dragon', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Disco Dragon', '🐉', 'epic', 'Breathes glitter, not fire.', 11);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('unicorn-dj', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Unicorn DJ', '🦄', 'epic', 'Remixes rainbows.', 12);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('cosmic-cake', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'Cosmic Cake', '🎂', 'legendary', 'Baked in a supernova. Still has candles.', 13);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('party-crown', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e01', 'The Party Crown', '👑', 'legendary', 'Whoever wears it picks the next song.', 14);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('party-hat', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Party hat', '🥳', 'common', '', 15);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('balloon', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Balloon', '🎈', 'common', '', 16);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('pizza', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Cold pizza', '🍕', 'common', '', 17);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('sock', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Lost sock', '🧦', 'common', '', 18);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('rubber-duck', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Rubber duck', '🦆', 'common', '', 19);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('cactus', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Office cactus', '🌵', 'common', '', 20);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('disco-ball', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Disco ball', '🪩', 'rare', '', 21);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('microphone', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Karaoke mic', '🎤', 'rare', '', 22);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('dice', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Lucky dice', '🎲', 'rare', '', 23);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('ufo', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'UFO', '🛸', 'rare', '', 24);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('crown', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Party crown', '👑', 'epic', '', 25);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('dragon', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Dragon', '🐉', 'epic', '', 26);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('unicorn', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Unicorn', '🦄', 'epic', '', 27);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('golden-trophy', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Golden trophy', '🏆', 'legendary', '', 28);
INSERT INTO pack_items (key, "setId", name, emoji, rarity, flavor, "sortOrder") VALUES ('rocket', '7a0c3f1e-5b1d-4c39-9d7e-0a1b2c3d4e02', 'Moon rocket', '🚀', 'legendary', '', 29);
-- The chip settings as they were in the code.
INSERT INTO site_settings (key, value) VALUES ('economy', '{"startChips":200,"earn":{"perPoint":1,"place":[150,100,50],"played":25,"roundWin":25,"arcadeWin":25}}');
