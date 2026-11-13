import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChildren, QueryList } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { TickerService, TickerItem } from './ticker.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AsyncPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements AfterViewInit, OnDestroy {
  title = 'kapitalcorpLLC';

  isScrolled = false;
  menuOpen = false;

  // TODO: replace with the real KapitalCorp contact address
  readonly contactEmail = 'info@kapitalcorp.com';
  contactOpen = false;

  // `dark: true` = logo has light artwork and needs a dark tile
  companyLogos = [
    { name: 'Medcube', src: 'assets/logos/medcube-light.png', dark: false, zoom: false },
    { name: 'Thinkcube', src: 'assets/logos/thinkcube-light.png', dark: false, zoom: false },
    { name: 'EF Johnson', src: 'assets/logos/efj.png', dark: false, zoom: false },
    { name: 'Hörmann Automotive', src: 'assets/logos/hoermann.jpg', dark: false, zoom: false },
    { name: 'Axiata Digital Labs', src: 'assets/logos/axiata.png', dark: false, zoom: false },
    { name: 'Mimosa', src: 'assets/logos/logo-1.jpg', dark: false, zoom: false },
    { name: 'Amrita Technologies', src: 'assets/logos/amrita-trim.png', dark: false, zoom: false }
  ];

  // Set to true to show the client recommendation cards again
  showRecommendations = false;

  recommendations = [
    {
      quote: 'KapitalCorp delivered quality products on time and handled every step of the import process with professionalism.',
      name: 'Dan Troutman',
      role: 'CTO',
      company: 'EFJohnson'
    },
    {
      quote: 'A dependable trading partner with strong local expertise. They made entering a new market simple for us.',
      name: 'Kerstin Schreiber',
      role: 'Member of the Management Board',
      company: 'Hörmann Gruppe'
    },
    {
      quote: 'Transparent, responsive and reliable. We value the long-term relationship we have built with the KapitalCorp team.',
      name: 'Ramesh Raghavan',
      role: 'CTO',
      company: 'Amrita Technologies'
    }
  ];

  ticker$: Observable<TickerItem[]>;
  lkrTicker$: Observable<TickerItem[]>;

  @ViewChildren('reveal') revealEls!: QueryList<ElementRef<HTMLElement>>;

  private observer?: IntersectionObserver;

  constructor(private tickerService: TickerService) {
    this.ticker$ = this.tickerService.ticker$;
    this.lkrTicker$ = this.tickerService.lkrTicker$;
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled = window.scrollY > 40;
  }

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.2 }
    );

    this.revealEls.forEach((el) => this.observer?.observe(el.nativeElement));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  openContact(): void {
    this.contactOpen = true;
    this.menuOpen = false;
    document.body.style.overflow = 'hidden';
  }

  @HostListener('document:keydown.escape')
  closeContact(): void {
    this.contactOpen = false;
    document.body.style.overflow = '';
  }

  submitContact(event: Event, name: string, email: string, message: string): void {
    event.preventDefault();
    const subject = `Website enquiry from ${name}`;
    const body = `Name: ${name}
Email: ${email}

${message}`;
    window.location.href =
      `mailto:${this.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.closeContact();
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }
}

