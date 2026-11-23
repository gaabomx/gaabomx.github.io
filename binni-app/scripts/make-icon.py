# Dibuja el ícono de la app (diseño propio): pin de ubicación con un camión.
from PIL import Image, ImageDraw, ImageFilter
S=1024
def icon(S=1024, bg=True):
    im=Image.new("RGB",(S,S),"#0f766e")
    d=ImageDraw.Draw(im)
    # degradado
    for y in range(S):
        t=y/S; c=(int(15+(20-15)*t),int(118+(83-118)*t),int(110+(45-110)*t))
        d.line([(0,y),(S,y)],fill=c)
    # camino curvo amarillo
    d.arc([-S*0.2,S*0.55,S*1.2,S*1.6],200,340,fill="#facc15",width=int(S*0.05))
    # pin
    cx,cy,r=S*0.5,S*0.40,S*0.26
    pin=Image.new("RGBA",(S,S),(0,0,0,0));pd=ImageDraw.Draw(pin)
    pd.ellipse([cx-r,cy-r,cx+r,cy+r],fill="white")
    pd.polygon([(cx-r*0.72,cy+r*0.62),(cx+r*0.72,cy+r*0.62),(cx,cy+r*1.75)],fill="white")
    sh=pin.filter(ImageFilter.GaussianBlur(S*0.02));im.paste((0,40,30),(0,int(S*0.015)),sh.split()[3].point(lambda a:a*0.5))
    im.paste(pin,(0,0),pin)
    # camión dentro del pin
    d=ImageDraw.Draw(im)
    bw,bh=r*1.15,r*0.95;x0,y0=cx-bw/2,cy-bh/2-r*0.05
    d.rounded_rectangle([x0,y0,x0+bw,y0+bh],radius=r*0.16,fill="#0f766e")
    d.rounded_rectangle([x0+bw*0.1,y0+bh*0.12,x0+bw*0.9,y0+bh*0.52],radius=r*0.06,fill="#a7f3d0")
    d.line([(cx,y0+bh*0.12),(cx,y0+bh*0.52)],fill="#0f766e",width=int(S*0.012))
    for fx in (0.22,0.78): d.ellipse([x0+bw*fx-r*0.09,y0+bh*0.66,x0+bw*fx+r*0.09,y0+bh*0.84],fill="#facc15")
    for fx in (0.25,0.75): d.rounded_rectangle([x0+bw*fx-r*0.1,y0+bh*0.92,x0+bw*fx+r*0.1,y0+bh*1.12],radius=r*0.04,fill="#0f766e")
    return im
icon().save("assets/icon-1024.png")
icon().save("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
# pantalla de carga
sp=Image.new("RGB",(2732,2732),"#0f766e");ic=icon().resize((620,620),Image.LANCZOS)
m=Image.new("L",(620,620),0);ImageDraw.Draw(m).rounded_rectangle([0,0,620,620],radius=140,fill=255)
sp.paste(ic,((2732-620)//2,(2732-620)//2),m)
for n in ["splash-2732x2732.png","splash-2732x2732-1.png","splash-2732x2732-2.png"]: sp.save("ios/App/App/Assets.xcassets/Splash.imageset/"+n)
print("ok")
