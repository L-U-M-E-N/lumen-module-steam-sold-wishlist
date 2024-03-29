import { QueryPackageSalesForCSV, QueryWishlistActionsForCSV, QueryFollowers } from './SteamCSV.js';

const COOKIE_FORMAT = (runAs) => config.COOKIE_FORMAT.replace('${runAs}', runAs);

export default class SteamSoldWishlist {
	static running = false;

	static init() {
		SteamSoldWishlist.update();

		// Update every day at 12 PM utc
		const nextUpdate = new Date();
		nextUpdate.setUTCHours(12,5,0,0);
		clearTimeout(SteamSoldWishlist.timeout);
		SteamSoldWishlist.timeout = setTimeout(() => {
			SteamSoldWishlist.update();

			clearInterval(SteamSoldWishlist.interval);
			SteamSoldWishlist.interval = setInterval(SteamSoldWishlist.update, 24 * 60 * 60 * 1000);
		}, Date.now() - nextUpdate.getTime());
	}

	static close() {
		clearInterval(SteamSoldWishlist.interval);
	}

	static async update() {
		if(SteamSoldWishlist.running) {
			return;
		}
		SteamSoldWishlist.running = true;

		log('Updating Steam status ...', 'info');

		try {
			await SteamSoldWishlist.UpdateSoldAmount();
		} catch(e) {
			log(' ' + e.message, 'error');
		}
		try {
			await SteamSoldWishlist.UpdateWishlistAmount();
		} catch(e) {
			log(' ' + e.message, 'error');
		}
		try {
			await SteamSoldWishlist.UpdateFollowers();
		} catch(e) {
			log(' ' + e.message, 'error');
		}
		SteamSoldWishlist.running = false;
	}

	static async UpdateSoldAmount() {
		const query = `
			INSERT INTO public.steam_sold(
				date, bundle_id, bundle_name, product_id, product_name, type, game, plateform, country_code, country,
				region, gross_units_sold, chargebacks_returns, net_units_sold, base_price, sale_price, currency,
				gross_steam_sale_usd, chargebacks_returns_usd, vat_usd, net_steam_sale_usd, tag
			)
			VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
				$11, $12, $13, $14, $15, $16, $17,
				$18, $19, $20, $21, $22
			)
		`;

		await Database.execQuery('BEGIN');

		await Database.execQuery(`
			DELETE FROM steam_sold
			WHERE date > (
				SELECT MAX(date) FROM steam_sold
			) - interval '35d'
		`);

		try {
			const dbData = (await Database.execQuery('SELECT * FROM steam_sold')).rows;

			for(const currentPackage of config.soldPackages) {
				const data = await QueryPackageSalesForCSV({ ...currentPackage, cookie: COOKIE_FORMAT(currentPackage.runAs) });

				for(const line of data) {
					const currentDate = (new Date(line['Date'] + 'T00:00:00.000Z')).getTime();

					if(dbData.find((data) =>
						data.bundle_id == line['Bundle(ID#)'] &&
						data.product_id == line['Product(ID#)'] &&
						(data.date.getTime() == currentDate) &&
						data.country_code == line['Country Code'] &&
						data.type == line["Type"] &&
						data.gross_units_sold == line["Gross Units Sold"] &&
						data.net_units_sold == line["Net Units Sold"] &&
						data.gross_steam_sale_usd == line["Gross Steam Sales (USD)"] &&
						data.net_steam_sale_usd == line["Net Steam Sales (USD)"]
					)) {
						continue;
					}

					try {
						await Database.execQuery(
							query,
							Object.values(line)
						);
					} catch(e) {
						log(' ' + e.message, 'error');
					}
				}
			}
		} catch(e) {
			await Database.execQuery('ROLLBACK');
			throw e;
		}

		await Database.execQuery('COMMIT');

		log('Saved Steam sold status', 'info');
	}

	static async UpdateWishlistAmount() {
		const query = `
			INSERT INTO public.steam_wishlists(datelocal, game, adds, deletes, purchases_and_activations, gifts)
			VALUES ($1, $2, $3, $4, $5, $6)
		`;

		const dbData = (await Database.execQuery('SELECT * FROM steam_wishlists')).rows;

		for(const currentPackage of config.wishlistApps) {
			const data = await QueryWishlistActionsForCSV({ ...currentPackage, cookie: COOKIE_FORMAT(currentPackage.runAs) });

			for(const line of data) {
				const currentDate = (new Date(line['DateLocal'] + 'T00:00:00.000Z')).getTime();

				if(dbData.find((data) =>
					data.datelocal.getTime() == currentDate &&
					data.game == line['Game']
				)) {
					continue;
				}

				try {
					await Database.execQuery(
						query,
						Object.values(line)
					);
				} catch(e) {
					log(' ' + e.message, 'error');
				}
			}
		}

		log('Saved Steam wishlist status', 'info');
	}

	static async UpdateFollowers() {
		const query = 'INSERT INTO public.steam_followers(datelocal, game, amount) VALUES ($1, $2, $3)'

		for(const currentPackage of config.wishlistApps) {
			const amount = await QueryFollowers({ id: currentPackage.id });

			try {
				await Database.execQuery(
					query,
					[new Date(), currentPackage.name, amount]
				);
			} catch(e) {
				log(' ' + e.message, 'error');
			}
		}

		log('Saved Steam followers status', 'info');
	}
}

SteamSoldWishlist.init();