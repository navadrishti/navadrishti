import { NextRequest, NextResponse } from 'next/server';

const phoneRegex = /^[+]?[1-9]\d{1,14}$/;

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';

		if (!phone) {
			return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
		}

		if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
			return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
		}

		return NextResponse.json({
			message: 'Phone verification request accepted',
			sent: true,
			phone
		});
	} catch (error) {
		console.error('Verify phone error:', error);
		return NextResponse.json({ error: 'Failed to process phone verification request' }, { status: 500 });
	}
}
