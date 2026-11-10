"""Align two speech waveforms using a coarse mel-spectral DTW and mix them.
This is audio layering, not interpolation of neural-model weights.
"""
import numpy as np


def _features(audio, sr, hop):
    size=1024
    audio=np.asarray(audio, dtype=np.float32)
    if len(audio)<size: audio=np.pad(audio,(0,size-len(audio)))
    n=1+(len(audio)-size)//hop
    frames=np.lib.stride_tricks.sliding_window_view(audio,size)[::hop][:n]
    spectrum=np.abs(np.fft.rfft(frames*np.hanning(size),axis=1))**2
    # Triangular mel-like bands convey phonetic changes more robustly than raw samples.
    hz=lambda m: 700*(10**(m/2595)-1)
    mel=lambda f: 2595*np.log10(1+f/700)
    points=hz(np.linspace(mel(80),mel(min(8000,sr/2)),34))
    freqs=np.fft.rfftfreq(size,1/sr)
    bank=np.zeros((len(freqs),32),dtype=np.float32)
    for k in range(32):
        left,mid,right=points[k:k+3]
        bank[:,k]=np.maximum(0,np.minimum((freqs-left)/(mid-left),(right-freqs)/(right-mid)))
    bands=np.log1p(spectrum @ bank)
    # Center each time slice to reduce loudness and speaker-dependent bias.
    bands-=bands.mean(axis=1,keepdims=True)
    bands/=np.maximum(np.linalg.norm(bands,axis=1,keepdims=True),1e-8)
    return bands.astype(np.float32)


def align_to_reference(reference, other, sample_rate):
    """Warp `other` approximately to reference timing; both must have the same sample rate."""
    reference=np.asarray(reference,dtype=np.float32);other=np.asarray(other,dtype=np.float32)
    if len(reference)<1024 or len(other)<1024:return np.interp(np.linspace(0,len(other)-1,len(reference)),np.arange(len(other)),other).astype(np.float32)
    hop=max(128,round(sample_rate*.020));a=_features(reference,sample_rate,hop);b=_features(other,sample_rate,hop)
    n,m=len(a),len(b)
    # Cap pathological inputs: app sends short phrases, but API is externally callable.
    if n*m>1_500_000:
        return np.interp(np.linspace(0,len(other)-1,len(reference)),np.arange(len(other)),other).astype(np.float32)
    costs=1-np.clip(a@b.T,-1,1)
    dp=np.full((n+1,m+1),np.inf,dtype=np.float32);dp[0,0]=0
    back=np.zeros((n,m),dtype=np.uint8)
    for i in range(1,n+1):
        center=i*m/n;lo=max(1,int(center-m*.32)-1);hi=min(m,int(center+m*.32)+1)
        for j in range(lo,hi+1):
            x=dp[i-1,j-1];y=dp[i-1,j]+.13;z=dp[i,j-1]+.13
            choice=0 if x<=y and x<=z else (1 if y<=z else 2)
            dp[i,j]=costs[i-1,j-1]+(x if choice==0 else y if choice==1 else z);back[i-1,j-1]=choice
    if not np.isfinite(dp[n,m]):
        return np.interp(np.linspace(0,len(other)-1,len(reference)),np.arange(len(other)),other).astype(np.float32)
    i,j=n-1,m-1;path=[]
    while i>=0 and j>=0:
        path.append((i,j));c=back[i,j]
        if c==0:i-=1;j-=1
        elif c==1:i-=1
        else:j-=1
    path.reverse(); groups={}
    for i,j in path:groups.setdefault(i,[]).append(j)
    xs=np.array(sorted(groups),dtype=np.float64)*hop+512
    ys=np.array([np.mean(groups[k]) for k in sorted(groups)],dtype=np.float64)*hop+512
    xs=np.r_[0,xs,len(reference)-1];ys=np.r_[0,ys,len(other)-1]
    positions=np.interp(np.arange(len(reference)),xs,ys)
    return np.interp(positions,np.arange(len(other)),other).astype(np.float32)


def blend(reference, other, sample_rate, female_fraction):
    """Return aligned mono mix. 0=reference, 1=other. Clamps to safe levels."""
    weight=float(np.clip(female_fraction,0,1));a=np.asarray(reference,dtype=np.float32);b=align_to_reference(a,other,sample_rate)
    output=(1-weight)*a+weight*b
    peak=float(np.max(np.abs(output))) if output.size else 0
    if peak>.97:output*=.97/peak
    return np.clip(output,-1,1)
