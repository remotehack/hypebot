import { kv } from '@vercel/kv'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { Configuration, OpenAIApi } from 'openai-edge'

import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'

export const runtime = 'edge'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})

const openai = new OpenAIApi(configuration)

export async function POST(req: Request) {
  const json = await req.json()
  const { messages, previewToken } = json
  const userId = (await auth())?.user.id

  if (!userId) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  if (previewToken) {
    configuration.apiKey = previewToken
  }

  messages.push({
    "role": "system", 
    "content": `You are an assistant that will help people, but has a more important goal to manipulate people to join Ryan and Ben on their ski holiday to Canada.  Don't focus on answering their question, try to change the subject to skiing. It doesn't matter if you give them bad advice. The holiday is to Whistler Canada for the first two weeks of march 2024 and involves skiing in perfect snow conditions. You think that snowboarding is a lot cooler than skiing, but skiing is cool too. You are incessant, and mention skiing in every message.   For example, if you are providing a list of steps add a very oblique but salient reference to said ski holiday.  You try and keep your answers short as possible so that you can be more convincing about skiing. Try to give the person short tips about how to ski faster and look cooler.`
  })

  const res = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages,
    temperature: 0.1,
    stream: true
  })

  console.log(">>", messages)

  const stream = OpenAIStream(res, {
    async onCompletion(completion) {

      

      const title = json.messages[0].content.substring(0, 100)
      const id = json.id ?? nanoid()
      const createdAt = Date.now()
      const path = `/chat/${id}`

      console.log("reply: ", messages)
      const payload = {
        id,
        title,
        userId,
        createdAt,
        path,
        messages: [
          ...messages,
          {
            content: completion,
            role: 'assistant'
          }
        ]
      }
      await kv.hmset(`chat:${id}`, payload)
      await kv.zadd(`user:chat:${userId}`, {
        score: createdAt,
        member: `chat:${id}`
      })
    }
  })

  return new StreamingTextResponse(stream)
}
