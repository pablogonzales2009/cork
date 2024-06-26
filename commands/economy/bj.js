const userAccount = require("../../schemas/userAccount");
const {
	ApplicationCommandOptionType,
	ButtonBuilder,
	ActionRowBuilder,
	EmbedBuilder,
} = require("discord.js");

module.exports = {
	name: "bj",
	description: "Play a game of blackjack to win some coins",
	requiresAccount: true,
	options: [{
		name: "amount",
		description: "The amount of money you want to bet",
		type: ApplicationCommandOptionType.String,
		required: true
	}],

	run: async (client, interaction) => {
		await interaction.deferReply();
		let amount = interaction.options.getString("amount");

		const existingUser = await userAccount.findOne({
			userId: interaction.user.id
		});

		if (isNaN(amount) && amount !== "all") return interaction.editReply("hey... that's not a number... you can't bet that...");
		if (amount == "all") amount = existingUser.balance;

		amount = parseInt(amount);

		if (amount < 250) return interaction.editReply("hey... you can't bet less than 250 coins");

		if (existingUser.balance < amount) return interaction.editReply("hey buddy... you only have " + existingUser.balance + " coins... you can't bet more than you have...");

		// Start the game of blackjack
		// Your blackjack game logic goes here

		// Example game logic:
		const playerHand = [];
		const dealerHand = [];

		// Deal initial cards

		playerHand.push(dealCard());
		dealerHand.push(dealCard());
		playerHand.push(dealCard());
		dealerHand.push(dealCard());

		const bjEmbed = new EmbedBuilder()
			.setTitle("blackjack")
			.setColor("#FFFFFF")
			.setThumbnail("https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.sevenjackpots.com%2Fwp-content%2Fuploads%2F2021%2F04%2Fblackjack-dealers-up-card-strategy.jpg&f=1&nofb=1&ipt=ea5faa0167d1a998c1cf4b1d32efefa8e6bdbcfc5a2d843bddf3a2d1c93df5e0&ipo=images")
			.setDescription(`i love blackjack! you have bet ${amount} coins`)
			.setFields({
				name: "Player",
				value: "0",
				inline: false
			}, {
				name: "Dealer",
				value: "0",
				inline: true
			}, {
				name: "Current Value",
				value: "0",
				inline: false
			})

		await interaction.editReply({ embeds: [bjEmbed] });
		updateScore(interaction, bjEmbed,playerHand,dealerHand);

		while (await runRound(playerHand, dealerHand, interaction ,bjEmbed)) {}

		const playerScore = calculateHandScore(playerHand);
		const dealerScore = calculateHandScore(dealerHand);

		const winnings = calculateWinnings(playerScore, dealerScore, amount);

		if (winnings > 0) {
			await userAccount.findOneAndUpdate({ userId: interaction.user.id }, {
				$inc: {
					balance: amount
				}
			});
			updateScore(interaction, bjEmbed, playerHand, dealerHand);
			await interaction.editReply({ embeds: [bjEmbed.setDescription(` <a:tekcoin:1234188584664436778> YOU WON!. you won ${amount} coins`)]});
		}
		if (winnings < 0) {
			await userAccount.findOneAndUpdate({ userId: interaction.user.id }, {
				$inc: {
					balance: -amount
				}
			});
			updateScore(interaction, bjEmbed, playerHand, dealerHand);
			await interaction.editReply({ embeds: [bjEmbed.setDescription(`<a:tekcoin:1234188584664436778> busted. you lost ${amount} coins`)]});
		}
		if (winnings === 0) {
			updateScore(interaction, bjEmbed, playerHand, dealerHand);
			await interaction.editReply({ embeds: [bjEmbed.setDescription(`<a:tekcoin:1234188584664436778> it was A TIE. no money lost.`)]});	
		}

	}
}

async function runRound(playerHand, dealerHand, interaction,bjEmbed) {
	updateScore(interaction, bjEmbed, playerHand, dealerHand);

	const hit = new ButtonBuilder()
		.setLabel("Hit")
		.setStyle(1)
		.setCustomId("hit");

	const stand = new ButtonBuilder()
		.setLabel("Stand")
		.setStyle(2)
		.setCustomId("stand");

	const row = new ActionRowBuilder()
		.addComponents(hit, stand);

	const response = await interaction.channel.send({ // Send a new message for each round
		content: `do you want to hit or stand?`,
		components: [row],
		ephemeral: true,
	});

	const cfilter = i => (i.customId === "hit" || i.customId === "stand") && i.user.id === interaction.user.id;
	
	try {
		const confirmation = await response.awaitMessageComponent({
			filter: cfilter,
			time: 60_000
		});

		if (confirmation.customId === 'hit') {
			// Player chooses to hit
			playerHand.push(dealCard());

			if (calculateHandScore(playerHand) > 21) {
				await confirmation.update({
					components: []
				});
				await confirmation.deleteReply();
				return false; // End the game when the player goes bust
			}

			await confirmation.update({
				components: []
			});
			await confirmation.deleteReply();

			return true;
		} else if (confirmation.customId === 'stand') {
			// Player chooses to stand
			// Dealer's turn
			while (calculateHandScore(dealerHand) < calculateHandScore(playerHand)) {
				dealerHand.push(dealCard());
			}
			await confirmation.update({
				components: []
			});
			await confirmation.deleteReply();

			return false; // End the game when the player stands
		}

	} catch (e) {
		await interaction.editReply({
			components: []
		});
		await confirmation.deleteReply();
		return false; // End the game if the user doesn't respond
	}
}

async function updateScore(interaction, embed, playerHand, dealerHand) {
	let cardemojis = ["♠️","♣️","♥️","♦️"];
	let playerCards = playerHand.map(card => card + " " + cardemojis[Math.floor(Math.random() * cardemojis.length)]);
	let dealerCards = dealerHand.map(card => card + " " + cardemojis[Math.floor(Math.random() * cardemojis.length)]);

	await interaction.editReply({ embeds: [embed.setFields({
		name: "Player",
		value: playerCards.join(" "),
		inline: false
	}, {
		name: "Dealer",
		value: dealerCards.join(" "),
		inline: true
	}, {
		name: "Current Value",
		value: calculateHandScore(playerHand).toString(),
		inline: false
	})] });
}


// Helper function to deal a random card
function dealCard() {
	const cards = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
	const randomIndex = Math.floor(Math.random() * cards.length);
	return cards[randomIndex];
}

// Helper function to calculate the score of a hand
function calculateHandScore(hand) {
	let score = 0;
	let numAces = 0;

	for (const card of hand) {
		if (card === "A") {
			score += 11;
			numAces++;
		} else if (card === "K" || card === "Q" || card === "J") {
			score += 10;
		} else {
			score += parseInt(card);
		}
	}

	while (score > 21 && numAces > 0) {
		score -= 10;
		numAces--;
	}

	return score;
}

// Helper function to calculate the winnings based on the game outcome
function calculateWinnings(playerScore, dealerScore, betAmount) {
	if (playerScore > 21 && dealerScore > 21) {
		return -betAmount;
	} else if (playerScore === dealerScore) {
		return 0;
	} else if (playerScore > dealerScore) {
		return betAmount * 2;
	} else {
		return -betAmount;
	}
}