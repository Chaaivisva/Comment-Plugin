import imaplib
import email
import re
from django.core.management.base import BaseCommand
from django.conf import settings
from django.contrib.auth.models import User
from comments.models import Comment
from django.core.mail import send_mail

# IMAP Configuration
IMAP_SERVER = 'imap.gmail.com'
IMAP_PORT = 993

class Command(BaseCommand):
    help = 'Fetches new emails from Gmail and processes them as comment replies.'

    def handle(self, *args, **options):
        self.stdout.write("Connecting to Gmail to fetch new comment replies...")
        try:
            mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
            mail.login(settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)
            mail.select('inbox')

            status, response = mail.search(None, '(UNSEEN)')
            email_ids = response[0].split()

            if not email_ids:
                self.stdout.write("No new emails found.")
                return

            for e_id in email_ids:
                status, response = mail.fetch(e_id, '(RFC822)')
                msg = email.message_from_bytes(response[0][1])

                subject = msg.get('Subject', '')
                sender_email = email.utils.parseaddr(msg.get('From', ''))[1]
                body = self.get_email_body(msg)

                match = re.search(r'Reply-ID: ([a-f0-9-]+)', subject)
                if match:
                    unique_reply_id = match.group(1)
                    
                    try:
                        parent_comment = Comment.objects.get(unique_reply_id=unique_reply_id)
                        try:
                            sender_user = User.objects.get(email=sender_email)
                        except User.DoesNotExist:
                            sender_user = parent_comment.user
                        
                        Comment.objects.create(
                            user=sender_user,
                            page_url=parent_comment.page_url,
                            selected_text=parent_comment.selected_text,
                            comment_text=body,
                            parent=parent_comment
                        )
                        self.stdout.write(self.style.SUCCESS(f"Successfully processed reply to comment ID {parent_comment.id}."))

                        original_commenter = parent_comment.user
                        if original_commenter and original_commenter.email != sender_email:
                            reply_subject = f"New reply to your comment on {parent_comment.page_url}"
                            reply_message = (
                                f"Hello {original_commenter.username},\n\n"
                                f"{sender_user.username} has replied to your comment:\n\n"
                                f"'{body}'"
                            )
                            send_mail(
                                reply_subject,
                                reply_message,
                                settings.DEFAULT_FROM_EMAIL,
                                [original_commenter.email],
                                fail_silently=False,
                            )
                        
                        mail.store(e_id, '+FLAGS', '\\Seen')
                    except Comment.DoesNotExist:
                        self.stdout.write(self.style.ERROR(f"Error: Comment with Reply-ID {unique_reply_id} not found."))
                else:
                    self.stdout.write(f"Skipping email from {sender_email}: No Reply-ID found.")
        
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"An error occurred: {e}"))
        finally:
            try:
                mail.logout()
            except NameError:
                pass

    def get_email_body(self, msg):
        if msg.is_multipart():
            for part in msg.walk():
                ctype = part.get_content_type()
                cdispo = str(part.get('Content-Disposition'))
                if ctype == 'text/plain' and 'attachment' not in cdispo:
                    return part.get_payload(decode=True).decode()
        else:
            return msg.get_payload(decode=True).decode()