const MONEY_PATTERN = /(?:₹|inr|rs\.?|rupees?)\s*([\d,]+(?:\.\d+)?)/i
const DATE_PATTERN = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/

export const extractMoney = (text: string): string | undefined => {
  const match = text.match(MONEY_PATTERN)
  return match?.[1]?.replace(/,/g, '')
}

export const extractDate = (text: string): string | undefined => text.match(DATE_PATTERN)?.[1]

export const extractNumberAfter = (text: string, labels: string[]): string | undefined => {
  const label = labels.join('|')
  return text.match(new RegExp(`(?:${label})\\s*(?:is|are|of|:)?\\s*(\\d[\\d,]*)`, 'i'))?.[1]?.replace(/,/g, '')
}

export const extractLocation = (text: string): { city?: string; state?: string } => {
  const match = text.match(/\b(?:in|at|around|near)\s+([A-Za-z][A-Za-z .'-]+?)(?:,\s*([A-Za-z][A-Za-z .'-]+))?(?=\s+(?:for|with|from|starting|until|and|budget|₹|inr)\b|[.!?,]|$)/i)
  return {
    city: match?.[1]?.trim(),
    state: match?.[2]?.trim(),
  }
}

export const extractTitle = (text: string): string | undefined => {
  const match = text.match(/\b(?:called|titled|named)\s+["“]?([^"”.!,]+)["”]?/i)
  if (match?.[1]) return match[1].trim()

  const subject = text.match(/\b(?:project|campaign)\s+(?:for|on|to)\s+([^,.!?]+?)(?=\s+(?:in|at|with|for|budget|₹|inr)\b|[,.!?]|$)/i)
  return subject?.[1]?.trim()
}

export const extractTimeline = (text: string): string | undefined => {
  const match = text.match(/\b(?:for|over|within)\s+(\d+\s*(?:weeks?|months?|days?|years?))\b/i)
  return match?.[1]
}
