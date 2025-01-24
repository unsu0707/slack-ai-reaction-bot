const { App } = require("@slack/bolt");
const OpenAI = require("openai");
const axios = require("axios"); // HTTP 요청을 위해 axios 추가

// OpenAI クライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Socket Mode を使用してアプリを初期化
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// 메시지 분석 함수
async function analyzeMessage(text) {
  const greetingKeywords = [
    "아침",
    "점심",
    "저녁",
    "안녕하세요",
    "좋은아침",
    "좋은점심",
    "좋은저녁",
    "좋은아침입니다",
    "좋은점심입니다",
    "좋은저녁입니다",
  ];

  // Remove emojis, special characters, and whitespace
  const messageCleaned = text
    .replace(/:[a-z_]+:/g, "") // Remove Slack-style emojis (e.g., :smile:)
    .replace(/[:~!@#$%^&*()\[\]{};':",./<>?|\\\-_=+`]/g, "") // Remove special characters
    .replace(/\s/g, "")
    .trim();

  // 유사도 비교
  let maxSimilarity = 0;
  let bestMatch = "";
  for (const keyword of greetingKeywords) {
    app.logger.info(`comparison: `, keyword, ` <-> `, messageCleaned);
    const similarity = similarityScore(keyword, messageCleaned);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = keyword;
    }
  }

  app.logger.info(`maxSimilarity: `, maxSimilarity);

  if (maxSimilarity >= 0.7) {
    if (messageCleaned.includes("아침")) return ":sunny:";
    if (messageCleaned.includes("점심")) return ":clock12:";
    if (messageCleaned.includes("저녁")) return ":city_sunset:";
    return "False";
  } else {
    return "True";
  }
}

async function getWeatherEmoji(city) {
  const latitude = 35.6895; // Tokyo의 위도
  const longitude = 139.6917; // Tokyo의 경도
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=weathercode&timezone=Asia/Tokyo`;
  const response = await axios.get(weatherUrl);
  const currentHour = new Date().getHours();
  const weatherCodes = response.data.hourly.weathercode;
  const timeStamps = response.data.hourly.time;

  // 현재 시간에 가장 가까운 시간의 인덱스 찾기
  let closestIndex = 0;
  let minDifference = Math.abs(
    new Date(timeStamps[0]).getHours() - currentHour
  );
  for (let i = 1; i < timeStamps.length; i++) {
    const hour = new Date(timeStamps[i]).getHours();
    const difference = Math.abs(hour - currentHour);
    if (difference < minDifference) {
      closestIndex = i;
      minDifference = difference;
    }
  }

  const weatherCode = weatherCodes[closestIndex];

  // 날씨 상태에 따라 Slack 이모지 매핑
  const weatherMap = {
    0: "sunny", // Clear sky ☀️
    1: "partly_sunny", // Mainly clear 🌤️
    2: "cloud", // Partly cloudy ☁️
    3: "cloud", // Overcast ☁️
    45: "fog", // Fog 🌫️
    48: "fog", // Depositing rime fog 🌫️
    51: "partly_sunny_rain", // Light drizzle 🌧️
    53: "rain_cloud", // Moderate drizzle 🌧️
    55: "rain", // Heavy drizzle 🌧️
    61: "partly_sunny_rain", // Light rain 🌧️
    63: "rain_cloud", // Moderate rain 🌧️
    65: "rain", // Heavy rain 🌧️
    71: "snowflake", // Light snowfall ❄️
    73: "snowflake", // Moderate snowfall ❄️
    75: "snowflake", // Heavy snowfall ❄️
    77: "snowflake", // Snow grains ❄️
    80: "partly_sunny_rain", // Light rain showers 🌧️
    81: "rain_cloud", // Moderate rain showers 🌧️
    82: "rain", // Heavy rain showers 🌧️
    85: "snowflake", // Light snow showers ❄️
    86: "snowflake", // Heavy snow showers ❄️
    95: "thunder_cloud_and_rain", // Thunderstorm ⛈️
    99: "thunder_cloud_and_rain", // Severe thunderstorm ⛈️
  };

  return weatherMap[weatherCode] || "sunny"; // 기본값은 question (❓)
}

// 문자열 유사도 계산 함수
function similarityScore(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;

  if (longerLength === 0) return 1.0;

  const editDistance = (longer, shorter) => {
    const matrix = Array.from({ length: shorter.length + 1 }, (_, i) =>
      Array.from({ length: longer.length + 1 }, (_, j) => 0)
    );
    for (let i = 0; i <= shorter.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= longer.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= shorter.length; i++) {
      for (let j = 1; j <= longer.length; j++) {
        const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[shorter.length][longer.length];
  };

  return (longerLength - editDistance(longer, shorter)) / longerLength;
}

// 絵文字変換関数
async function convertToEmoji(text) {
  const analysisResult = await analyzeMessage(text);

  if (analysisResult !== "True") {
    app.logger.info(`This message is just greeting: `, text);
    return [analysisResult.replace(/:/g, ""), "blob-wave"];
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You're a program for the Slack Bot API. Extract the keywords from the user's message, except for the greeting text, and return your feelings after reading the message and between 2 and 5 slack emojis representing the keywords. If the message includes a greeting, include :sunny: instead of :wave:.
Please return only emoji in your response, with the slack emoji names in plain text(not the unicode emoji character), :xxx:, separated by commas(,).

Please use emojis used by young people as much as possible.

Emoji used by old men
:grinning::smiley::grin::sweat_smile::cold_sweat::disappointed_relieved::sweat::hand::sweat_drops::exclamation:️:bangbang:: question::interrobang::grey_exclamation::grey_question::star:️:sunny::

Emoji used by young people
:joy::rolling_on_the_floor_laughing::upside_down_face:🥺:heart_eyes:🥰:raised_hands::face_palm::heartbeat:`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: 150,
    });

    let emojisString = completion.choices[0].message.content;
    emojisString = emojisString
      .replace(/```/g, "")
      .replace(/:/g, "")
      .replace(/\s/g, "");
    let emojis = emojisString.split(",");

    // Always include :blob-wave: in the returned emojis
    if (!emojis.includes("blob-wave")) {
      emojis.push("blob-wave");
    }

    console.log(emojis);

    return emojis;
  } catch (error) {
    app.logger.error("絵文字変換中にエラーが発生しました:", error);
    return [];
  }
}

// 最近 72時間のメッセージをチェックする関数
async function checkRecentMessages(client, logger) {
  try {
    // 최근 72시간의 타임스탬프 계산
    const now = new Date();
    const oldest =
      new Date(now.getTime() - 24 * 60 * 60 * 1000).getTime() / 1000;

    const CHANNELS = [
      { id: "C085U16K56K", name: "테스트" },
      { id: "C13KZBY0G", name: "잡담" },
    ];

    const authResponse = await client.auth.test();
    const botUserId = authResponse.user_id;
    logger.info(`Bot User ID: ${botUserId}`);

    for (const channel of CHANNELS) {
      try {
        const result = await client.conversations.history({
          channel: channel.id,
          oldest: oldest,
        });

        logger.info(
          `Checking messages in channel ${channel.name} (${channel.id})`
        );

        for (const message of result.messages) {
          const keywords = [
            "안녕하세요",
            "좋은 아침",
            "좋은아침",
            "좋은 점심",
            "좋은점심",
            "좋은 저녁",
            "좋은저녁",
            "좋은 오후",
            "좋은오후",
            "아침입니다",
            "점심입니다",
            "오후입니다",
          ];

          if (
            message.text &&
            keywords.some((keyword) => message.text.includes(keyword))
          ) {
            const reactions = message.reactions || [];
            const botReactions = reactions.filter(
              (reaction) => reaction.users && reaction.users.includes(botUserId)
            );

            logger.info(
              `Found greeting message in ${channel.name}: ${message.text}`
            );

            if (botReactions.length === 0) {
              const emojis = await convertToEmoji(message.text);
              logger.info(`Adding reactions: ${emojis.join(", ")}`);
              for (var emoji of emojis) {
                if (emoji == "sunny") {
                  emoji = await getWeatherEmoji("tokyo");
                }
                try {
                  await client.reactions.add({
                    channel: channel.id,
                    timestamp: message.ts,
                    name: emoji,
                  });
                } catch (error) {
                  logger.error(
                    `リアクション追加中にエラーが発生しました: ${error}`
                  );
                }
              }
            } else {
              logger.info(
                `Message in ${channel.name} already has bot reactions, skipping`
              );
            }
          }
        }
      } catch (error) {
        logger.error(
          `Channel ${channel.name} (${channel.id}) processing error:`,
          error
        );
      }
    }
  } catch (error) {
    logger.error("メッセージチェック中にエラーが発生しました:", error);
  }
}

// メッセージイベントの処理
app.message(async ({ message, client, logger }) => {
  const keywords = [
    "안녕하세요",
    "좋은 아침",
    "좋은아침",
    "좋은 점심",
    "좋은점심",
    "좋은 저녁",
    "좋은저녁",
    "좋은 오후",
    "좋은오후",
    "아침입니다",
    "점심입니다",
    "오후입니다",
  ];

  if (
    message.text &&
    keywords.some((keyword) => message.text.includes(keyword))
  ) {
    const emojis = await convertToEmoji(message.text);

    for (var emoji of emojis) {
      if (emoji == "sunny") {
        emoji = await getWeatherEmoji("tokyo");
      }
      try {
        logger.info(`${emoji}`);
        await client.reactions.add({
          channel: message.channel,
          timestamp: message.ts,
          name: emoji,
        });
      } catch (error) {
        logger.error(`リアクション追加中にエラーが発生しました: ${error}`);
      }
    }
  }
});

(async () => {
  const server = await app.start(process.env.PORT || 3000);
  console.log("⚡️ Bolt app is running!");

  // アプリ起動時に最近のメッセージをチェック
  await checkRecentMessages(app.client, app.logger);
})();
