import { NextResponse } from 'next/server';
import { parseCampaigns } from '@/lib/campaigns';

export async function GET() {
  try {
    const campaigns = parseCampaigns();
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('Error loading campaigns:', error);
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 });
  }
}
