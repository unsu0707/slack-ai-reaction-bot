const { App } = require('@slack/bolt');
const OpenAI = require('openai');

// OpenAI クライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Socket Mode を使用してアプリを初期化
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

// 絵文字変換関数
async function convertToEmoji(text) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Emoji converter. Output Format: :emoji1:,:emoji2:

Rules:
- Always use commas between emojis
- If '하핫' exists, add :hahat:
- Format: :smile:,:blob-wave:

Examples:
안녕하세요 -> :sunny:,:blob-wave:
안녕하세요 하핫 -> :sunny:,:blob-wave:,:hahat:
좋은 아침. 오늘 춥다 -> :sunny:,:blob-wave:,:cold:
한국에서 좋은 아침입니다. -> :sunny:,:blob-wave:,:flag-kr:`
        },
        {
          role: "user",
          content: `Please convert the following user input \n ## Input: ${text}`
        }
      ],
      max_tokens: 150
    });

    let emojisString = completion.choices[0].message.content;
    emojisString = emojisString.replace(/```/g, '').replace(/:/g, '').replace(/\s/g, '');
    return emojisString.split(',');
  } catch (error) {
    console.error('絵文字変換中にエラーが発生しました:', error);
    return [];
  }
}

// メッセージイベントの処理
app.message(async ({ message, client, logger }) => {
  const keywords = ["안녕하세요", "좋은 아침", "좋은아침", "좋은 점심", "좋은점심", "좋은 저녁", "좋은저녁", "좋은 오후", "좋은오후", "아침입니다", "점심입니다", "오후입니다"];
  
  if (message.text && keywords.some(keyword => message.text.includes(keyword))) {
    const emojis = await convertToEmoji(message.text);
    
    for (const emoji of emojis) {
      try {
        logger.info(`${emoji}`);
        await client.reactions.add({
          channel: message.channel,
          timestamp: message.ts,
          name: emoji
        });
      } catch (error) {
        logger.error(`リアクション追加中にエラーが発生しました: ${error}`);
      }
    }
  }
});

// アプリメンションの処理
app.event('app_mention', async ({ event, client, say, logger }) => {
  try {
    logger.info(event.text);
    const text = event.text.replace(`<@${event.bot_id}>`, '').trim();
    
    if (text.startsWith('emoji')) {
      const emojiText = text.split(' ').slice(1).join(' ');
      const emojis = await convertToEmoji(emojiText);
      
      logger.info(emojis);
      
      for (const emoji of emojis) {
        await client.reactions.add({
          channel: event.channel,
          timestamp: event.ts,
          name: emoji
        });
      }
      return;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant. Your model name is `gpt-4o-mini`." },
        { role: "user", content: text }
      ],
      max_tokens: 150
    });

    await say({
      text: completion.choices[0].message.content,
      thread_ts: event.thread_ts || event.ts
    });
  } catch (error) {
    logger.error('Error handling mention:', error);
    await say({
      text: "申し訳ありません。エラーが発生しました。",
      thread_ts: event.thread_ts || event.ts
    });
  }
});

// ホームタブの更新
app.event('app_home_opened', async ({ event, client, logger }) => {
  try {
    await client.views.publish({
      user_id: event.user,
      view: {
        type: 'home',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '아침 인사에 대신 리액션을 달아드리는 봇입니다'
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '아침 인사를 읽고, gpt-4o-mini모델을 통해 대답할 이모지를 생각해서, 당신의 인사에 리액션을 해드립니다 :sunny: :blob-wave:'
            }
          }
        ]
      }
    });
  } catch (error) {
    logger.error('Error publishing home tab:', error);
  }
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
