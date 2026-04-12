//OpenRouter Client

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export async function OpenRouterChat(messages: ChatMessage[]): Promise<string>{
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL,
            messages
        })
    });
    if(!res.ok){
        const err = await res.text();
        throw new Error(`OpenRouter error ${res.status}: ${err} `);
    }
    const data = await res.json();

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.length > 0) {
        return content;
    }

    if (data?.error) {
        throw new Error(`OpenRouter returned an error payload: ${JSON.stringify(data.error)}`);
    }

    throw new Error(`OpenRouter returned an unexpected payload: ${JSON.stringify(data)}`);
}
    