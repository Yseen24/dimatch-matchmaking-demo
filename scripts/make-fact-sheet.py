"""Regenerate the print handout from sources/economics.json using ReportLab."""
import json
from decimal import Decimal as D
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
for name, style in [("SummitSans", "Regular"), ("SummitSansBold", "Bold")]:
    pdfmetrics.registerFont(TTFont(name, "/usr/share/fonts/truetype/liberation/LiberationSans-"+style+".ttf"))

root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'sources/economics.json').read_text(), parse_float=D)
file = root / 'sources/assets/DIMATCH_Fact_Sheet.pdf'
c = Canvas(str(file), pagesize=(612,792), pageCompression=1)
c.setTitle('DIMATCH | Matchmaking fact sheet')
c.setAuthor('DIMATCH')
ink, grey, lime, pale = '#152118','#4A584D','#D5F63A','#EFF4EA'
W, H, left = 612, 792, 40
def box(x,y,w,h,color):
    c.setFillColor(colors.HexColor(color));c.rect(x,H-y-h,w,h,fill=1,stroke=0)
def text(x,y,t,n=10,bold=False,color=ink):
    c.setFillColor(colors.HexColor(color));c.setFont('SummitSansBold' if bold else 'SummitSans',n);c.drawString(x,H-y,t)
def lines(x,y,t,width=532,size=10,leading=14,color=grey):
    for line in simpleSplit(t,'SummitSans',size,width):
        text(x,y,line,size,color=color); y+=leading
    return y
def header(page,title,subtitle):
    box(0,0,W,116,ink);text(left,29,'DIMATCH  /  MATCHMAKING DEMO',10,True,lime)
    text(left,67,title,29,True,'#FFFFFF');text(left,94,subtitle,11,False,'#DDE8D8')
    box(left,763,532,1,'#CBD5C8');text(left,780,'DIMATCH  /  MATCHMAKING FACT SHEET     17 NOV 2026',8,True,grey);text(524,780,f'{page} / 2',8,True,grey)
def sub(y,t): text(left,y,t,14,True)
def table(y,headers,rows,widths,h=24,emphasis=()):
    xs=[left]
    for w in widths:xs.append(xs[-1]+w)
    box(left,y,sum(widths),h,ink)
    for x,t in zip(xs,headers):text(x+6,y+h*.67,t,9,True,'#FFFFFF')
    y+=h
    for i,row in enumerate(rows):
        color=pale if i%2==0 else '#FFFFFF'
        box(left,y,sum(widths),h,'#DAEDB3' if i in emphasis else color)
        for x,t in zip(xs,row):text(x+6,y+h*.68,str(t),9.2,i in emphasis)
        y+=h
    return y
def note(y,title,t):
    text(left,y,title,10,True);return lines(left,y+15,t)
def cost(r):return (sum(r['input'])*data['rates']['input']+sum(r['output'])*data['rates']['output'])/D(1000000)
def money(n):return f'${n:.2f}'
wait,proposal=data['runs']
header(1,'Cost of an agent outcome','Measured prototype usage  /  fictional Casablanca match data')
y=note(142,'What counts as an outcome?', 'A player request can end with saved availability. An organizer request can end with a valid proposal pending approval. A delivered match requires the players to attend and the game to take place.')
y=table(y+9,['Recorded outcome','Calls','Input','Output','Total tokens','Model cost'],[[r['label']+'  /  '+r['date'],len(r['input']),f"{sum(r['input']):,}",sum(r['output']),f"{sum(r['input'])+sum(r['output']):,}",f"${cost(r):.7f}"] for r in data['runs']],[159,46,62,61,88,116],26)
y=lines(left,y+18,'The 12 November coordinator run made five successful MCP calls, reached human approval and recorded one simulated player acceptance. No completed real match is attributable to either run.')
sub(y+19,'Token and price reconciliation')
y=lines(left,y+37,'Model gpt-4.1-mini-2025-04-14. Published USD per million tokens: $0.40 input, $0.10 cached input and $1.60 output. Both examples recorded zero cached input tokens.')
y=lines(left,y+7,'Waiting request = (2,206 x $0.40 + 48 x $1.60) / 1,000,000 = $0.0009592. Proposal = (3,962 x $0.40 + 275 x $1.60) / 1,000,000 = $0.0020248.')
header_cells=['Call','Waiting request: input / output','Proposal: input / output']
rows=[]
for i in range(6):
    rows.append([i+1, f"{wait['input'][i]} / {wait['output'][i]}" if i<3 else '-',f"{proposal['input'][i]} / {proposal['output'][i]}"])
y=table(y+9,header_cells,rows,[63,240,229],20)
y=note(y+19,'How representative are these calls?', 'Within the development snapshot, all three waiting-request sessions with model responses used three calls (mean and maximum 3). Both coordinator sessions ending in pending approval or simulated acceptance used six (mean and maximum 6). Calls per real delivered match are unmeasured.')
y=note(y+6,'What can you check live?', 'Type a request directly into DIMATCH. OpenAI selects a matchmaking action and answers from its MCP results. The same page shows the tool inputs and outputs, eligible roster and model-reported tokens for each completed turn. Guided replay runs without new inference.')
y=lines(left,y+6,'Sources: isolated Supabase agent_demo_runs usage events, 12 and 16 Nov 2026; calculated costs, unreconciled to a provider invoice. OpenAI published model rates, checked 17 Nov 2026.',size=8.5,leading=11)
text(left,y+2,'Official model and pricing reference',8.5,True,grey)
c.linkURL('https://developers.openai.com/api/docs/models/gpt-4.1-mini',(left,H-y-5,left+180,H-y+9))
assert y<748,(1,y)
c.showPage()
header(2,'Economics of a delivered 5v5','USD per completed match  /  three planning scenarios')
y=lines(left,141,'Payer: ten players at a proposed $1.50 net service fee each. Full-match net revenue is $15.00. Venue charges are paid separately. The estimate uses 10 MAD per USD as a planning convention.')
volumes=data['volumes']; infra=[D(f)/D(v) for f,v in zip(data['infrastructure'],volumes)]
allowance=cost(wait)*data['requestsPerMatch']
fixed=data['organizer']+data['admin']+data['messaging']+data['payment']+allowance
costs=[fixed+i for i in infra]; revenue=data['price']*data['players']
rep=lambda n:[money(n)]*3
rows=[['Net service revenue']+rep(revenue),['Organizer allowance']+rep(data['organizer']),['Administrative supervision']+rep(data['admin']),['Model: ten waiting-request equivalents']+[f'${allowance:.3f}']*3,['Tools, API and messaging allowance']+rep(data['messaging']),['Allocated infrastructure']+[money(i) for i in infra],['Payment processing allowance']+rep(data['payment']),['Direct delivery budget']+[money(i) for i in costs],['Contribution before overhead']+[money(revenue-i) for i in costs]]
y=table(y+9,['Matches per month','50 (pilot)','500 (10x)','5,000 (100x)'],rows,[238,92,100,102],21,emphasis=(7,8))
y=lines(left,y+16,'Scale assumptions: $45 / $90 / $450 monthly infrastructure divided by delivered matches. Admin time is budgeted at five minutes at $6/hour. Model allowance = 10 x $0.0009592. Actual attempts, retries, invoices, support, refunds and equipment costs must be reconciled. Contribution excludes acquisition and overhead.',size=9.5,leading=13)
sub(y+15,'Player value and evidence')
y=note(y+34,'Current workaround and baseline', 'Players submit availability and an organizer reconciles the slot, venue and roster. The founder reports 60 seconds for manual availability submission. Agent time on the same task and full-match coordination time are unmeasured; cash and time savings cannot yet be quantified.')
y=note(y+5,'Who will pay?', 'Founder-reported survey: 95 of 100 respondents accepted the proposed price. The underlying responses have not been independently reconciled. Beta service fees were zero. Paid repeat participation remains a pilot measure.')
y=note(y+5,'Where the pilot starts', 'Atlantique El Hank, Casablanca has committed to provide API access. API capabilities, pilot volume and organizer coverage await verification. Track active coordination minutes, delivered-match cost, paid repeat participation, organizer earnings and venue bookings.')
y=lines(left,y+6,'Sources: DIMATCH founder estimates and survey summary; July to October operations; prototype usage logs. Four validated historical games carried the $3 organizer allowance; cash payout was not verified.',size=8.5,leading=11)
assert y<748,(2,y)
c.showPage();c.save()
